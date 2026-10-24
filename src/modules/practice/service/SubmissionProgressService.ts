import RhythmClientService from '../../audio/service/RhythmClientService.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeResultDTO from '../dto/PracticeResultDTO.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import PracticeFileService from './PracticeFileService.ts';

const { messages, errorCodes } = PracticeConstant;

// Moves a submission through its jobs from Rhythm callbacks, or from Rhythm's own state when a callback was lost.
export default class SubmissionProgressService {
  constructor(
    private readonly repository: PracticeSubmissionRepository = new PracticeSubmissionRepository(),
    private readonly files: PracticeFileService = new PracticeFileService(),
    private readonly client: RhythmClientService = new RhythmClientService(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async apply(callback: Practice.ProgressCallback): Promise<boolean> {
    const record = await this.repository.findByEvaluationId(callback.evaluationId);
    if (!record || record.attempt !== callback.attempt || record.status !== 'PROCESSING') return false;
    return this.applyTo(record, callback);
  }

  // GBR-65 / GBR-11: failed or too slow; not counted (GBR-61), retry opens after 5 s then 10 s (GBR-59)
  async markFailed(record: Practice.SubmissionRecord, code: string, message: string): Promise<boolean> {
    const isLastAttempt = record.retryCount >= PracticeConstant.maxRetries;
    const delayMs = record.retryCount === 0 ? PracticeConstant.retryDelaysMs.FIRST : PracticeConstant.retryDelaysMs.LATER;
    const now = this.now();
    // The failed job is kept as the stage, since a retry restarts from it (GBR-63)
    const isUpdated = await this.repository.updateIfCurrent(record.id, { attempt: record.attempt, status: 'PROCESSING' }, {
      status: 'FAILED', errorCode: code, errorMessage: message, ...(record.stage ? { stage: record.stage } : {}),
      retryAvailableAt: isLastAttempt ? null : new Date(now.getTime() + delayMs)
    });
    if (isUpdated && isLastAttempt) await this.files.deleteStudentFile(record, now);
    return isUpdated;
  }

  // Called on read: a job silent for longer than the limit is checked against Rhythm, then failed (GBR-65)
  async reconcile(record: Practice.SubmissionRecord): Promise<Practice.SubmissionRecord> {
    if (!this.isStale(record)) return record;
    const remote = await this.fetchRemote(record);
    const isApplied = remote ? await this.applyRemote(record, remote) : false;
    if (!isApplied) await this.markFailed(record, errorCodes.JOB_TIMEOUT, messages.JOB_TIMEOUT);
    return (await this.repository.findById(record.id)) ?? record;
  }

  private async applyTo(record: Practice.SubmissionRecord, callback: Practice.ProgressCallback): Promise<boolean> {
    const expected = { attempt: record.attempt, status: 'PROCESSING' as const };
    const stage = PracticeConstant.stageByJob[callback.job];
    if (callback.status === 'started') {
      if (!this.isForward(record.stage, stage)) return false;
      return this.repository.updateIfCurrent(record.id, expected, { stage, stageStartedAt: this.now() });
    }
    if (callback.status === 'done') {
      return callback.job === 'feedback' && callback.result ? this.complete(record, callback.result) : false;
    }
    if (callback.status === 'rejected') {
      // GBR-12: rejected with a reason; GBR-13: not counted
      return this.repository.updateIfCurrent(record.id, expected, {
        status: 'REJECTED', stage, rejectReason: callback.reason || messages.QUALITY_REJECTED,
        errorCode: callback.code || errorCodes.QUALITY_REJECTED
      });
    }
    return this.markFailed({ ...record, stage }, callback.code || errorCodes.EVALUATION_FAILED, callback.reason || messages.PROCESSING_FAILED);
  }

  private async complete(record: Practice.SubmissionRecord, result: Audio.Result): Promise<boolean> {
    return this.repository.updateIfCurrent(record.id, { attempt: record.attempt, status: 'PROCESSING' }, {
      status: 'COMPLETED', stage: 'FEEDBACK', accuracy: result.overallScore,
      tempoDeviation: PracticeResultDTO.toTempoDeviation(result.teacherTempoBpm, result.studentTempoBpm),
      result, aiFeedback: result.aiFeedback, analyzedAt: this.now()
    });
  }

  private isForward(current: Practice.Stage | null, next: Practice.Stage): boolean {
    if (!current) return true;
    return PracticeConstant.stageOrder.indexOf(next) >= PracticeConstant.stageOrder.indexOf(current);
  }

  private isStale(record: Practice.SubmissionRecord): boolean {
    if (record.status !== 'PROCESSING' || !record.stageStartedAt) return false;
    return this.now().getTime() - record.stageStartedAt.getTime() > PracticeConstant.jobTimeoutMs + PracticeConstant.staleGraceMs;
  }

  private async fetchRemote(record: Practice.SubmissionRecord): Promise<Audio.EvaluationResponse | null> {
    if (!record.evaluationId || record.publicationState !== 'published') return null;
    try {
      return await this.client.get(record.evaluationId);
    } catch {
      return null; // Rhythm unreachable: the timeout below still applies
    }
  }

  // Replays Rhythm's state as if its callback had arrived; true when the submission moved on
  private async applyRemote(record: Practice.SubmissionRecord, remote: Audio.EvaluationResponse): Promise<boolean> {
    if ((remote.attempt ?? 1) !== record.attempt) return false;
    const job = remote.stage ?? PracticeConstant.jobByStage[record.stage ?? 'QUALITY_CHECK'];
    const base = { evaluationId: remote.evaluationId, attempt: record.attempt, job };
    if (remote.status === 'completed' && remote.result) return this.applyTo(record, { ...base, job: 'feedback', status: 'done', result: remote.result });
    if (remote.status === 'rejected' || remote.status === 'failed') {
      return this.applyTo(record, { ...base, status: remote.status, code: remote.error?.code, reason: remote.error?.message });
    }
    // Still running a later job than we know of: only the callback was lost
    const remoteStage = PracticeConstant.stageByJob[job];
    if (remote.status === 'processing' && remoteStage !== record.stage) return this.applyTo(record, { ...base, status: 'started' });
    return false;
  }
}
