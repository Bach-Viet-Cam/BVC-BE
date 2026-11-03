import RhythmClientService from '../../audio/service/RhythmClientService.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSegmentRepository from '../repository/PracticeSegmentRepository.ts';

const { messages, errorCodes } = PracticeConstant;

// Moves a segment attempt through its jobs from Rhythm callbacks, or from Rhythm's own state when a callback was lost.
// Unlike submissions there is no retry and no file cleanup: a failed attempt is simply practised again.
export default class SegmentProgressService {
  constructor(
    private readonly repository: PracticeSegmentRepository = new PracticeSegmentRepository(),
    private readonly client: RhythmClientService = new RhythmClientService(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async apply(callback: Practice.SegmentProgressCallback): Promise<boolean> {
    const record = await this.repository.findByEvaluationId(callback.evaluationId);
    if (!record || record.attempt !== callback.attempt || record.status !== 'PROCESSING') return false;
    return this.applyTo(record, callback);
  }

  // Called on read: reconcile the persisted status with Rhythm when a callback may have been lost
  async reconcile(record: Practice.SegmentRecord): Promise<Practice.SegmentRecord> {
    if (record.status !== 'PROCESSING') return record;
    const remote = await this.fetchRemote(record);
    if (remote) await this.applyRemote(record, remote);
    return (await this.repository.findById(record.id)) ?? record;
  }

  private async applyTo(record: Practice.SegmentRecord, callback: Practice.SegmentProgressCallback): Promise<boolean> {
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
      return this.repository.updateIfCurrent(record.id, expected, {
        status: 'REJECTED', stage, rejectReason: callback.reason || messages.QUALITY_REJECTED,
        errorCode: callback.code || errorCodes.QUALITY_REJECTED
      });
    }
    return this.repository.updateIfCurrent(record.id, expected, {
      status: 'FAILED', stage, errorCode: callback.code || errorCodes.EVALUATION_FAILED, errorMessage: messages.SEGMENT_FAILED
    });
  }

  private async complete(record: Practice.SegmentRecord, result: Practice.SegmentResult): Promise<boolean> {
    return this.repository.updateIfCurrent(record.id, { attempt: record.attempt, status: 'PROCESSING' }, {
      status: 'COMPLETED', stage: 'FEEDBACK', result, aiFeedback: result.aiFeedback,
      accuracy: result.overallScore, pitchAccuracy: result.pitchAccuracyPercent, rhythmAccuracy: result.rhythmAccuracyPercent,
      baselineAccuracy: result.baseline?.overallScore ?? null, baselinePitch: result.baseline?.pitchAccuracyPercent ?? null,
      baselineRhythm: result.baseline?.rhythmAccuracyPercent ?? null, analyzedAt: this.now()
    });
  }

  private isForward(current: Practice.Stage | null, next: Practice.Stage): boolean {
    if (!current) return true;
    return PracticeConstant.stageOrder.indexOf(next) >= PracticeConstant.stageOrder.indexOf(current);
  }

  private async fetchRemote(record: Practice.SegmentRecord): Promise<Audio.EvaluationResponse | null> {
    if (record.publicationState !== 'published') return null;
    try {
      return await this.client.get(record.evaluationId);
    } catch {
      return null; // Keep the attempt in PROCESSING until Rhythm is reachable or sends a callback
    }
  }

  // Replays Rhythm's state as if its callback had arrived; true when the attempt moved on
  private async applyRemote(record: Practice.SegmentRecord, remote: Audio.EvaluationResponse): Promise<boolean> {
    if ((remote.attempt ?? 1) !== record.attempt) return false;
    const job = remote.stage ?? PracticeConstant.jobByStage[record.stage ?? 'QUALITY_CHECK'];
    const base = { evaluationId: remote.evaluationId, attempt: record.attempt, job };
    if (remote.status === 'completed' && remote.result) {
      return this.applyTo(record, { ...base, job: 'feedback', status: 'done', result: remote.result as Practice.SegmentResult });
    }
    if (remote.status === 'rejected' || remote.status === 'failed') {
      return this.applyTo(record, { ...base, status: remote.status, code: remote.error?.code, reason: remote.error?.message });
    }
    // Still running a later job than we know of: only the callback was lost
    const remoteStage = PracticeConstant.stageByJob[job];
    if (remote.status === 'processing' && remoteStage !== record.stage) return this.applyTo(record, { ...base, status: 'started' });
    return false;
  }
}
