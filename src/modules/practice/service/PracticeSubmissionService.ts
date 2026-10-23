import { randomUUID } from 'node:crypto';
import EnvConfig from '../../../config/EnvConfig.ts';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import AssignmentConstant from '../../assignments/constant/AssignmentConstant.ts';
import SubmissionPolicyService from '../../assignments/service/SubmissionPolicyService.ts';
import RhythmClientService from '../../audio/service/RhythmClientService.ts';
import RhythmPublisherService from '../../audio/service/RhythmPublisherService.ts';
import AssignmentPolicyService from '../../classes/service/AssignmentPolicyService.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSubmissionDTO from '../dto/PracticeSubmissionDTO.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import SubmissionProgressService from './SubmissionProgressService.ts';

const { messages, errorCodes } = PracticeConstant;

interface PracticeSubmissionDependencies {
  repository?: PracticeSubmissionRepository;
  progress?: SubmissionProgressService;
  publisher?: RhythmPublisherService;
  client?: RhythmClientService;
  canSubmitAssignment?: (studentId: string, assignmentId: string) => Promise<{ allowed: boolean }>;
  createReadUrl?: (storageKey: string, expiresInSec: number) => Promise<string>;
  now?: () => Date;
}

export default class PracticeSubmissionService {
  private readonly repository: PracticeSubmissionRepository;
  private readonly progress: SubmissionProgressService;
  private readonly publisher: RhythmPublisherService;
  private readonly client: RhythmClientService;
  private readonly canSubmitAssignment: (studentId: string, assignmentId: string) => Promise<{ allowed: boolean }>;
  private readonly createReadUrl: (storageKey: string, expiresInSec: number) => Promise<string>;
  private readonly now: () => Date;
  private readonly dto = new PracticeSubmissionDTO();

  constructor(dependencies: PracticeSubmissionDependencies = {}) {
    this.repository = dependencies.repository ?? new PracticeSubmissionRepository();
    this.progress = dependencies.progress ?? new SubmissionProgressService(this.repository);
    this.publisher = dependencies.publisher ?? RhythmPublisherService.instance;
    this.client = dependencies.client ?? new RhythmClientService();
    this.canSubmitAssignment = dependencies.canSubmitAssignment ?? SubmissionPolicyService.canSubmit;
    this.createReadUrl = dependencies.createReadUrl ?? ((storageKey, expiresInSec) => StorageService.driver.createReadUrl(storageKey, expiresInSec));
    this.now = dependencies.now ?? (() => new Date());
  }

  async create(studentId: string, input: Practice.CreateInput): Promise<Practice.SubmissionDTO> {
    const upload = await this.repository.findOwnedUpload(studentId, input.studentUploadId);
    if (!upload) throw AppError.badRequest(messages.UPLOAD_INVALID);
    const assignmentVersionId = input.assignmentId ? await this.checkAssignment(studentId, input) : null;
    const sheet = await this.findTemplate(input);

    const { submission, busyId } = await this.repository.createIfIdle({
      studentId, pieceId: input.pieceId, sheetMusicId: sheet.id, assignmentId: input.assignmentId ?? null, assignmentVersionId,
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
      templateUrl: await this.createReadUrl(sheet.referenceAudio?.storageKey ?? '', PracticeConstant.templateUrlLifetimeSec),
      studentUrl: record.fileUrl ?? '', instrumentId: sheet.instrument.code,
      requestedAt: this.now().toISOString(), callbackUrl: `${EnvConfig.publicApiUrl}${PracticeConstant.callbackPath}`
    };
    const state = await this.publisher.publish(job);
    await this.repository.updatePublication(record.id, { publicationState: state, messageId: job.messageId });
    // publish_unknown may still reach the worker; reconciliation settles it after the job timeout
    if (state === 'publish_failed') await this.progress.markFailed(record, errorCodes.PUBLISH_FAILED, messages.PUBLISH_FAILED);
    return (await this.repository.findById(record.id)) ?? record;
  }

  private async checkAssignment(studentId: string, input: Practice.CreateInput): Promise<string | null> {
    const assignmentId = input.assignmentId ?? '';
    const [policy, gate] = await Promise.all([this.canSubmitAssignment(studentId, assignmentId), this.repository.findAssignmentGate(assignmentId, studentId)]);
    const now = this.now();
    if (!policy.allowed || !gate || !AssignmentPolicyService.canSubmit({ ...gate, now })) throw AppError.forbidden(AssignmentConstant.messages.CANNOT_SUBMIT);
    if (gate.pieceId !== input.pieceId) throw AppError.badRequest(messages.PIECE_MISMATCH);
    return gate.currentVersionId;
  }

  // The student may submit to any instrument's sheet of the piece; its reference recording is the template
  private async findTemplate(input: Practice.CreateInput): Promise<Practice.SheetTemplate> {
    const sheet = await this.repository.findSheet(input.pieceId, input.sheetMusicId);
    if (!sheet) throw AppError.notFound(messages.SHEET_NOT_FOUND);
    if (sheet.referenceAudio?.status !== 'READY') throw new AppError(messages.NO_REFERENCE_AUDIO, 422);
    return sheet;
  }
}
