import { randomUUID } from 'node:crypto';
import EnvConfig from '../../../config/EnvConfig.ts';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import RhythmClientService from '../../audio/service/RhythmClientService.ts';
import RhythmPublisherService from '../../audio/service/RhythmPublisherService.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSubmissionDTO from '../dto/PracticeSubmissionDTO.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import PracticeAssignmentResolver from './PracticeAssignmentResolver.ts';
import SubmissionProgressService from './SubmissionProgressService.ts';

const { messages, errorCodes } = PracticeConstant;

interface PracticeSubmissionDependencies {
  repository?: PracticeSubmissionRepository;
  progress?: SubmissionProgressService;
  publisher?: RhythmPublisherService;
  client?: RhythmClientService;
  createReadUrl?: (storageKey: string) => string | Promise<string>;
  now?: () => Date;
}

export default class PracticeSubmissionService {
  private readonly repository: PracticeSubmissionRepository;
  private readonly progress: SubmissionProgressService;
  private readonly publisher: RhythmPublisherService;
  private readonly client: RhythmClientService;
  private readonly createReadUrl: (storageKey: string) => string | Promise<string>;
  private readonly now: () => Date;
  private readonly dto = new PracticeSubmissionDTO();

  constructor(dependencies: PracticeSubmissionDependencies = {}) {
    this.repository = dependencies.repository ?? new PracticeSubmissionRepository();
    this.progress = dependencies.progress ?? new SubmissionProgressService(this.repository);
    this.publisher = dependencies.publisher ?? RhythmPublisherService.instance;
    this.client = dependencies.client ?? new RhythmClientService();
    this.createReadUrl = dependencies.createReadUrl ?? ((storageKey) => StorageService.driver.createReadUrl(storageKey));
    this.now = dependencies.now ?? (() => new Date());
  }

  async create(studentId: string, input: Practice.CreateInput): Promise<Practice.SubmissionDTO> {
    const upload = await this.repository.findOwnedUpload(studentId, input.studentUploadId);
    if (!upload) throw AppError.badRequest(messages.UPLOAD_INVALID);
    const sheet = await this.findTemplate(input);
    const link = await this.findAssignmentLink(studentId, sheet, input.assignmentId);

    const { submission, busyId } = await this.repository.createIfIdle({
      studentId, pieceId: input.pieceId, sheetMusicId: sheet.id, assignmentId: link?.assignmentId ?? null, assignmentVersionId: link?.assignmentVersionId ?? null,
      studentUploadId: upload.id, fileUrl: upload.url, evaluationId: randomUUID(), messageId: randomUUID()
    }, this.now());
    if (!submission) throw AppError.conflict(messages.BUSY, { details: { submissionId: busyId ?? '' } });
    return this.dto.toResponse(await this.publish(submission, sheet));
  }

  async get(studentId: string, submissionId: string): Promise<Practice.SubmissionDTO> {
    const record = await this.repository.findOwned(submissionId, studentId);
    if (!record) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    return this.dto.toResponse(await this.progress.reconcile(record));
  }

  // GBR-49: the processing submission of this piece, if any, so the record screen can stay locked
  async getActive(studentId: string, pieceId: string): Promise<Practice.SubmissionDTO | null> {
    const record = await this.repository.findActiveProcessing(studentId, pieceId);
    if (!record) return null;
    const current = await this.progress.reconcile(record);
    return current.status === 'PROCESSING' ? this.dto.toResponse(current) : null;
  }

  // GBR-63: restart from the job that failed
  async retry(studentId: string, submissionId: string): Promise<Practice.SubmissionDTO> {
    const record = await this.repository.findOwned(submissionId, studentId);
    if (!record) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    if (record.status !== 'FAILED' || record.retryCount >= PracticeConstant.maxRetries || record.fileDeletedAt) {
      throw AppError.conflict(messages.RETRY_NOT_ALLOWED);
    }
    if (record.retryAvailableAt && record.retryAvailableAt.getTime() > this.now().getTime()) throw AppError.conflict(messages.RETRY_TOO_EARLY);

    const restarted: Practice.SubmissionRecord = {
      ...record, status: 'PROCESSING', attempt: record.attempt + 1, retryCount: record.retryCount + 1,
      stageStartedAt: this.now(), retryAvailableAt: null, errorCode: null, errorMessage: null
    };
    const isClaimed = await this.repository.updateIfCurrent(record.id, { attempt: record.attempt, status: 'FAILED' }, {
      status: restarted.status, attempt: restarted.attempt, retryCount: restarted.retryCount, stageStartedAt: restarted.stageStartedAt ?? undefined,
      retryAvailableAt: null, errorCode: null, errorMessage: null
    });
    if (!isClaimed) throw AppError.conflict(messages.RETRY_NOT_ALLOWED);
    return this.dto.toResponse(await this.dispatchRetry(restarted));
  }

  private async dispatchRetry(record: Practice.SubmissionRecord): Promise<Practice.SubmissionRecord> {
    try {
      const fromJob = PracticeConstant.jobByStage[record.stage ?? 'QUALITY_CHECK'];
      const isKnownToRhythm = record.publicationState === 'published' && record.evaluationId
        ? await this.client.retry(record.evaluationId, fromJob, record.attempt)
        : false;
      if (isKnownToRhythm) return (await this.repository.findById(record.id)) ?? record;
      // The job never reached Rhythm (publish failed or lost): send it again as this attempt
      const sheet = record.sheetMusicId ? await this.repository.findSheet(record.pieceId, record.sheetMusicId) : null;
      if (!sheet) throw AppError.notFound(messages.SHEET_NOT_FOUND);
      return await this.publish({ ...record, messageId: randomUUID() }, sheet);
    } catch {
      await this.progress.markFailed(record, errorCodes.RETRY_DISPATCH_FAILED, messages.RETRY_DISPATCH_FAILED);
      return (await this.repository.findById(record.id)) ?? record;
    }
  }

  private async publish(record: Practice.SubmissionRecord, sheet: Practice.SheetTemplate): Promise<Practice.SubmissionRecord> {
    const job: Audio.Job = {
      evaluationId: record.evaluationId ?? '', messageId: record.messageId ?? randomUUID(), attempt: record.attempt,
      templateUrl: await this.createReadUrl(sheet.referenceAudio?.storageKey ?? ''),
      templateAnalysisId: sheet.analysisJobId,
      studentUrl: record.fileUrl ?? '', instrumentId: sheet.instrument.code,
      requestedAt: this.now().toISOString(), callbackUrl: `${EnvConfig.fileStoragePublicBaseUrl}${PracticeConstant.callbackPath}`
    };
    const state = await this.publisher.publish(job);
    await this.repository.updatePublication(record.id, { publicationState: state, messageId: job.messageId });
    // publish_unknown may still reach the worker; reconciliation settles it after the job timeout
    if (state === 'publish_failed') await this.progress.markFailed(record, errorCodes.PUBLISH_FAILED, messages.PUBLISH_FAILED);
    return (await this.repository.findById(record.id)) ?? record;
  }

  // A send counts toward the class assignment only for the MAIN sheet of the class instrument while the assignment is
  // open; any other send is plain practice and stays unlinked, even when the client names an assignment.
  private async findAssignmentLink(studentId: string, sheet: Practice.SheetTemplate, hintAssignmentId?: string): Promise<{ assignmentId: string; assignmentVersionId: string | null } | null> {
    const enrollment = await this.repository.findClassAssignments(studentId, sheet.pieceId);
    const resolved = PracticeAssignmentResolver.resolve(sheet, enrollment, this.now(), hintAssignmentId);
    if (!resolved || resolved.state !== 'OPEN') return null;
    return { assignmentId: resolved.candidate.id, assignmentVersionId: resolved.candidate.currentVersionId };
  }

  // The student may submit to any instrument's sheet of the piece; its reference recording is the template
  private async findTemplate(input: Practice.CreateInput): Promise<Practice.SheetTemplate> {
    const sheet = await this.repository.findSheet(input.pieceId, input.sheetMusicId);
    if (!sheet) throw AppError.notFound(messages.SHEET_NOT_FOUND);
    if (sheet.referenceAudio?.status !== 'READY') throw new AppError(messages.NO_REFERENCE_AUDIO, 422);
    return sheet;
  }
}
