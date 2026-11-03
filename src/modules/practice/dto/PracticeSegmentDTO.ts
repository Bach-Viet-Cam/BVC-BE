import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeResultDTO from './PracticeResultDTO.ts';

export default class PracticeSegmentDTO {
  private readonly results = new PracticeResultDTO();

  toAttempt(record: Practice.SegmentRecord, previous: Practice.SegmentRecord | null): Practice.SegmentAttemptDTO {
    const isCompleted = record.status === 'COMPLETED';
    const feedback = (record.aiFeedback ?? '').trim();
    return {
      id: record.id, submissionId: record.submissionId, startSec: record.startSec, endSec: record.endSec,
      status: record.status, stage: record.stage, createdAt: record.createdAt.toISOString(), analyzedAt: record.analyzedAt?.toISOString() ?? null,
      scores: isCompleted ? this.toScores(record.accuracy, record.pitchAccuracy, record.rhythmAccuracy) : null,
      // Times are already on the original recording's timeline, since Rhythm offsets them by the range start
      issues: isCompleted ? this.results.toIssues(this.results.parseAnalysis(record.result)) : [],
      aiFeedback: isCompleted && feedback ? { text: feedback, isFallback: feedback === PracticeConstant.fallbackFeedback } : null,
      error: this.toError(record),
      comparison: {
        original: record.baselineAccuracy === null ? null : this.toScores(record.baselineAccuracy, record.baselinePitch, record.baselineRhythm),
        previous: previous ? { ...this.toScores(previous.accuracy, previous.pitchAccuracy, previous.rhythmAccuracy), attemptId: previous.id } : null
      }
    };
  }

  toSummary(record: Practice.SegmentRecord): Practice.SegmentSummaryDTO {
    return {
      id: record.id, startSec: record.startSec, endSec: record.endSec, status: record.status,
      overall: record.accuracy, baselineOverall: record.baselineAccuracy, createdAt: record.createdAt.toISOString()
    };
  }

  private toScores(overall: number | null, pitch: number | null, rhythm: number | null): Practice.SegmentScores {
    return { overall: this.toPercent(overall), pitch: this.toPercent(pitch), rhythm: this.toPercent(rhythm) };
  }

  private toPercent(score: number | null): number | null {
    return score === null ? null : Math.min(100, Math.max(0, Math.round(score)));
  }

  private toError(record: Practice.SegmentRecord): Practice.SegmentAttemptDTO['error'] {
    if (record.status === 'REJECTED') return { code: record.errorCode, message: record.rejectReason };
    if (record.status === 'FAILED') return { code: record.errorCode, message: record.errorMessage };
    return null;
  }
}
