import { randomUUID } from 'node:crypto';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import RhythmPublisherService from '../../audio/service/RhythmPublisherService.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSegmentDTO from '../dto/PracticeSegmentDTO.ts';
import PracticeSegmentRepository from '../repository/PracticeSegmentRepository.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import EvaluationJobBuilderService from './EvaluationJobBuilderService.ts';
import SegmentProgressService from './SegmentProgressService.ts';

const { messages, errorCodes } = PracticeConstant;

interface SegmentInput { startSec: number; endSec: number; studentUploadId: string; }

interface PracticeSegmentDependencies {
  repository?: PracticeSegmentRepository;
  uploads?: PracticeSubmissionRepository;
  publisher?: RhythmPublisherService;
  jobBuilder?: EvaluationJobBuilderService;
  progress?: SegmentProgressService;
  now?: () => Date;
}

// UC-03: re-practice one time range of a completed submission without creating a new submission
export default class PracticeSegmentService {
  private readonly repository: PracticeSegmentRepository;
  private readonly uploads: PracticeSubmissionRepository;
  private readonly publisher: RhythmPublisherService;
  private readonly jobBuilder: EvaluationJobBuilderService;
  private readonly progress: SegmentProgressService;
  private readonly dto = new PracticeSegmentDTO();

  constructor(dependencies: PracticeSegmentDependencies = {}) {
    const now = dependencies.now ?? (() => new Date());
    this.repository = dependencies.repository ?? new PracticeSegmentRepository();
    this.uploads = dependencies.uploads ?? new PracticeSubmissionRepository();
    this.publisher = dependencies.publisher ?? RhythmPublisherService.instance;
    this.progress = dependencies.progress ?? new SegmentProgressService(this.repository, undefined, now);
    this.jobBuilder = dependencies.jobBuilder
      ?? new EvaluationJobBuilderService((storageKey) => StorageService.driver.createReadUrl(storageKey), now);
  }

  async create(studentId: string, submissionId: string, input: SegmentInput): Promise<Practice.SegmentAttemptDTO> {
    const original = await this.repository.findOriginal(submissionId, studentId);
    if (!original) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    if (original.status !== 'COMPLETED' || !original.evaluationId || !original.sheetMusic) throw AppError.conflict(messages.SEGMENT_NOT_READY);
    this.ensureValidRange(original, input);

    const upload = await this.uploads.findOwnedUpload(studentId, input.studentUploadId);
    if (!upload) throw AppError.notFound(messages.UPLOAD_INVALID);

    const record = await this.repository.create({
      submissionId, studentId, startSec: input.startSec, endSec: input.endSec, studentUploadId: upload.id, fileUrl: upload.url,
      evaluationId: randomUUID(), messageId: randomUUID()
    });
    return this.dto.toAttempt(await this.publish(record, original.sheetMusic, original.evaluationId), null);
  }

  async get(studentId: string, segmentId: string): Promise<Practice.SegmentAttemptDTO> {
    const record = await this.repository.findOwned(segmentId, studentId);
    if (!record) throw AppError.notFound(messages.SEGMENT_NOT_FOUND);
    const current = await this.progress.reconcile(record);
    return this.dto.toAttempt(current, current.status === 'COMPLETED' ? await this.repository.findPreviousSameRange(current) : null);
  }

  // Newest first; one extra row tells whether another page follows
  async list(studentId: string, submissionId: string, page: { cursor?: string; limit: number }): Promise<Practice.SegmentPageDTO> {
    const original = await this.repository.findOriginal(submissionId, studentId);
    if (!original) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    const rows = await this.repository.listBySubmission(submissionId, studentId, { cursor: page.cursor, limit: page.limit + 1 });
    const items = rows.slice(0, page.limit);
    return { items: items.map((row) => this.dto.toSummary(row)), nextCursor: rows.length > page.limit ? items[items.length - 1].id : null };
  }

  private async publish(record: Practice.SegmentRecord, sheet: Practice.SheetTemplate, baselineEvaluationId: string): Promise<Practice.SegmentRecord> {
    const job: Audio.Job = {
      ...await this.jobBuilder.build(
        sheet, { evaluationId: record.evaluationId, messageId: record.messageId, attempt: record.attempt },
        record.fileUrl ?? '', PracticeConstant.segmentCallbackPath
      ),
      templateStartSec: record.startSec, templateEndSec: record.endSec, baselineEvaluationId
    };
    const state = await this.publisher.publish(job);
    if (state === 'publish_failed') {
      await this.repository.updateIfCurrent(record.id, { attempt: record.attempt, status: 'PROCESSING' }, {
        status: 'FAILED', errorCode: errorCodes.PUBLISH_FAILED, errorMessage: messages.SEGMENT_FAILED
      });
    } else {
      // publish_unknown may still reach the worker; reconciliation follows Rhythm's eventual status
      await this.repository.updatePublication(record.id, { publicationState: state });
    }
    return (await this.repository.findById(record.id)) ?? record;
  }

  // The range must lie inside the template; when its length is unknown only the order is checked
  private ensureValidRange(original: Practice.SegmentOrigin, input: SegmentInput): void {
    const isOrdered = Number.isFinite(input.startSec) && Number.isFinite(input.endSec) && input.startSec >= 0 && input.endSec > input.startSec;
    const durationSec = this.readDuration(original);
    if (!isOrdered || (durationSec !== null && input.endSec > durationSec)) throw AppError.badRequest(messages.SEGMENT_INVALID);
  }

  private readDuration(original: Practice.SegmentOrigin): number | null {
    const chartDuration = (original.pitchChart as { durationSec?: unknown } | null)?.durationSec;
    if (typeof chartDuration === 'number' && chartDuration > 0) return chartDuration;
    const quality = (original.result as { studentAudioQuality?: { audio?: { durationSec?: unknown } | null } | null } | null)?.studentAudioQuality;
    const recordedDuration = quality?.audio?.durationSec;
    return typeof recordedDuration === 'number' && recordedDuration > 0 ? recordedDuration : null;
  }
}
