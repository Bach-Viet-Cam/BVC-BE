import { z } from 'zod';
import PracticeConstant from '../constant/PracticeConstant.ts';

const { issueLabels } = PracticeConstant;

// Submission.result is JSON written by the Rhythm service; every field falls back so an older or partial
// result still renders instead of failing the whole screen
const segmentTime = { startTime: z.number().min(0), endTime: z.number().min(0) };
const optionalBpm = z.number().positive().nullable().catch(null);
const analysisSchema = z.looseObject({
  overallScore: z.number().catch(0),
  pitchAccuracyPercent: z.number().catch(0),
  rhythmAccuracyPercent: z.number().catch(0),
  teacherTempoBpm: optionalBpm,
  studentTempoBpm: optionalBpm,
  aiFeedback: z.string().catch(''),
  rhythmSegments: z.array(z.object({ ...segmentTime, status: z.enum(['fast', 'slow', 'missing']) })).catch([]),
  pitchErrorSegments: z.array(z.object({ ...segmentTime, averageCentsDifference: z.number() })).catch([]),
  studentAudioQuality: z.looseObject({
    audio: z.looseObject({ durationSec: z.number().positive() }).nullable().catch(null),
    warnings: z.array(z.object({ code: z.string(), message: z.string() })).catch([])
  }).nullable().catch(null)
});

export default class PracticeResultDTO {
  // Percent the student was faster (+) or slower (-) than the teacher. Beat tracking often locks onto half or
  // double the real tempo, so the reading closest to the teacher's tempo is used.
  static toTempoDeviation(teacherBpm: unknown, studentBpm: unknown): number | null {
    const teacher = Number(teacherBpm);
    const student = Number(studentBpm);
    if (!Number.isFinite(teacher) || !Number.isFinite(student) || teacher <= 0 || student <= 0) return null;
    const ratio = [student / teacher, (2 * student) / teacher, student / (2 * teacher)]
      .reduce((closest, candidate) => (Math.abs(Math.log(candidate)) < Math.abs(Math.log(closest)) ? candidate : closest));
    return Math.round((ratio - 1) * 1000) / 10;
  }

  parseAnalysis(raw: unknown): Practice.AnalysisResult {
    const parsed = analysisSchema.safeParse(raw);
    const analysis = parsed.success ? parsed.data : analysisSchema.parse({});
    const durationSec = analysis.studentAudioQuality?.audio?.durationSec;
    return {
      overallScore: analysis.overallScore,
      pitchAccuracyPercent: analysis.pitchAccuracyPercent,
      rhythmAccuracyPercent: analysis.rhythmAccuracyPercent,
      teacherTempoBpm: analysis.teacherTempoBpm,
      studentTempoBpm: analysis.studentTempoBpm,
      aiFeedback: analysis.aiFeedback,
      rhythmSegments: analysis.rhythmSegments,
      pitchErrorSegments: analysis.pitchErrorSegments,
      durationSec: durationSec ? Math.round(durationSec * 10) / 10 : null,
      warnings: analysis.studentAudioQuality?.warnings ?? []
    };
  }

  // Ids are stable per submission (p = pitch, r = rhythm) and shared with the pitch chart segments
  toIssues(analysis: Practice.AnalysisResult): Practice.ResultIssueDTO[] {
    const pitchIssues = analysis.pitchErrorSegments.map((segment, index): Practice.ResultIssueDTO => {
      const cents = Math.round(segment.averageCentsDifference);
      return {
        id: `p${index}`, kind: 'pitch', startSec: this.toSeconds(segment.startTime), endSec: this.toSeconds(segment.endTime),
        rhythmStatus: null, centsDifference: cents, label: `Lệch ${cents > 0 ? '+' : ''}${cents}¢`
      };
    });
    const rhythmIssues = analysis.rhythmSegments.map((segment, index): Practice.ResultIssueDTO => ({
      id: `r${index}`, kind: 'rhythm', startSec: this.toSeconds(segment.startTime), endSec: this.toSeconds(segment.endTime),
      rhythmStatus: segment.status, centsDifference: null, label: issueLabels[segment.status]
    }));
    return [...pitchIssues, ...rhythmIssues].sort((first, second) => first.startSec - second.startSec);
  }

  toResult(record: Practice.ResultRecord, attemptNo: number, audio: Practice.ResultDTO['audio']): Practice.ResultDTO {
    const base = {
      submission: {
        id: record.id, status: record.status, submittedAt: record.createdAt.toISOString(),
        analyzedAt: record.analyzedAt?.toISOString() ?? null, attemptNo
      },
      piece: record.piece,
      sheetMusic: record.sheetMusic ? { id: record.sheetMusic.id, name: record.sheetMusic.name } : null,
      assignment: record.assignment ? { id: record.assignment.id, title: record.assignment.title, classId: record.assignment.classId } : null
    };
    if (record.status !== 'COMPLETED') {
      return {
        ...base, recording: { durationSec: null }, scores: null, tempo: null, aiFeedback: null, issues: [], qualityWarnings: [],
        audio: { teacherUrl: null, studentUrl: null }
      };
    }
    const analysis = this.parseAnalysis(record.result);
    const deviationPercent = PracticeResultDTO.toTempoDeviation(analysis.teacherTempoBpm, analysis.studentTempoBpm);
    const feedback = (record.aiFeedback ?? analysis.aiFeedback).trim();
    return {
      ...base,
      recording: { durationSec: analysis.durationSec },
      scores: {
        overall: this.toPercent(record.accuracy ?? analysis.overallScore),
        pitch: this.toPercent(analysis.pitchAccuracyPercent),
        rhythm: this.toPercent(analysis.rhythmAccuracyPercent),
        tempo: deviationPercent === null
          ? null
          : Math.max(0, Math.round(100 - Math.abs(deviationPercent) * PracticeConstant.tempoScorePenaltyPerPercent))
      },
      tempo: { teacherBpm: analysis.teacherTempoBpm, studentBpm: analysis.studentTempoBpm, deviationPercent },
      aiFeedback: feedback ? { text: feedback, isFallback: feedback === PracticeConstant.fallbackFeedback } : null,
      issues: this.toIssues(analysis),
      qualityWarnings: analysis.warnings,
      audio
    };
  }

  // attempts are oldest first and end with the current submission; totalAttempts numbers them
  toHistory(record: Practice.ResultRecord, attempts: Practice.AttemptRecord[], totalAttempts: number): Practice.ResultHistoryDTO {
    const firstAttemptNo = totalAttempts - attempts.length + 1;
    const items = attempts.map((attempt, index): Practice.AttemptDTO => ({
      submissionId: attempt.id, attemptNo: firstAttemptNo + index, accuracyPercent: this.toPercent(attempt.accuracy ?? 0),
      submittedAt: attempt.createdAt.toISOString(), isCurrent: attempt.id === record.id
    }));
    const [previous, current] = attempts.slice(-2).map((attempt) => attempt.accuracy ?? 0);
    return {
      pieceTitle: record.piece.title,
      isFirstAttempt: totalAttempts <= 1,
      deltaPercent: attempts.length >= 2 ? Math.round((current - previous) * 10) / 10 : null,
      bestPercent: Math.max(0, ...items.map((item) => item.accuracyPercent)),
      attempts: items
    };
  }

  private toPercent(score: number): number {
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  private toSeconds(seconds: number): number {
    return Math.round(seconds * 100) / 100;
  }
}
