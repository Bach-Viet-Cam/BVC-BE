import { z } from 'zod';
import PracticeConstant from '../constant/PracticeConstant.ts';

const { MAX_POINTS, TIME_MAP_POINTS, MIN_VOICED_RATIO } = PracticeConstant.pitchChart;
const SEMITONE_RATIO = 2 ** (1 / 12);

const f0Track = z.array(z.number().positive().nullable());
const analysisFileSchema = z.looseObject({
  pitch: z.looseObject({
    sampleRate: z.number().positive(),
    hopLength: z.number().positive(),
    teacherF0Hz: f0Track.min(1),
    studentF0Hz: f0Track
  }),
  alignment: z.looseObject({ studentFrameByTeacherFrame: z.array(z.number().int().min(0)) })
});

// Turns a Rhythm evaluation analysis file into the chart the FE draws. The x axis is teacher time; the student
// curve is placed through the DTW alignment Rhythm used for scoring, so it lines up with the error segments.
export default class PitchChartBuilderService {
  static parse(raw: unknown): Practice.AnalysisFile {
    const parsed = analysisFileSchema.safeParse(raw);
    if (!parsed.success) throw new Error('File phân tích cao độ sai định dạng.');
    const { pitch, alignment } = parsed.data;
    const frames = alignment.studentFrameByTeacherFrame;
    if (frames.length !== pitch.teacherF0Hz.length) throw new Error('Dữ liệu căn chỉnh không khớp số khung bản mẫu.');
    return {
      sampleRate: pitch.sampleRate, hopLength: pitch.hopLength,
      teacherF0Hz: pitch.teacherF0Hz, studentF0Hz: pitch.studentF0Hz, studentFrameByTeacherFrame: frames
    };
  }

  static build(file: Practice.AnalysisFile, issues: Practice.ResultIssueDTO[]): Practice.PitchChartDTO {
    const frameSec = file.hopLength / file.sampleRate;
    const studentHz = file.studentFrameByTeacherFrame.map((frame) => file.studentF0Hz[frame] ?? null);
    const points = PitchChartBuilderService.downsample(file.teacherF0Hz, studentHz, frameSec);
    const voicedHz = points.flatMap(([, teacher, student]) => [teacher, student]).filter((hz): hz is number => hz !== null);
    if (voicedHz.length === 0) throw new Error('Bản thu không có khung nào có cao độ.');
    const durationSec = PitchChartBuilderService.round(file.teacherF0Hz.length * frameSec);
    return {
      durationSec,
      minHz: PitchChartBuilderService.round(Math.min(...voicedHz) / SEMITONE_RATIO),
      maxHz: PitchChartBuilderService.round(Math.max(...voicedHz) * SEMITONE_RATIO),
      points,
      segments: issues
        .filter((issue) => issue.startSec < durationSec)
        .map((issue) => ({ id: issue.id, kind: issue.kind, startSec: issue.startSec, endSec: Math.min(issue.endSec, durationSec), label: issue.label })),
      timeMap: PitchChartBuilderService.buildTimeMap(file.studentFrameByTeacherFrame, frameSec)
    };
  }

  // One point per bucket of teacher frames: the median pitch, or null when the bucket is mostly silent
  static downsample(teacherHz: (number | null)[], studentHz: (number | null)[], frameSec: number): Practice.PitchPoint[] {
    const bucketSize = Math.max(1, Math.ceil(teacherHz.length / MAX_POINTS));
    const points: Practice.PitchPoint[] = [];
    for (let start = 0; start < teacherHz.length; start += bucketSize) {
      const end = Math.min(start + bucketSize, teacherHz.length);
      points.push([
        PitchChartBuilderService.round(start * frameSec),
        PitchChartBuilderService.bucketMedian(teacherHz.slice(start, end)),
        PitchChartBuilderService.bucketMedian(studentHz.slice(start, end))
      ]);
    }
    return points;
  }

  static bucketMedian(values: (number | null)[]): number | null {
    const voiced = values.filter((hz): hz is number => hz !== null).sort((first, second) => first - second);
    if (voiced.length === 0 || voiced.length < values.length * MIN_VOICED_RATIO) return null;
    const middle = Math.floor(voiced.length / 2);
    const median = voiced.length % 2 === 1 ? voiced[middle] : (voiced[middle - 1] + voiced[middle]) / 2;
    return PitchChartBuilderService.round(median);
  }

  // Sparse [teacherSec, studentSec] pairs; the FE interpolates between them to seek the student audio
  static buildTimeMap(studentFrames: number[], frameSec: number): [number, number][] {
    const step = Math.max(1, Math.ceil(studentFrames.length / TIME_MAP_POINTS));
    const indexes: number[] = [];
    for (let index = 0; index < studentFrames.length; index += step) indexes.push(index);
    if (indexes.at(-1) !== studentFrames.length - 1) indexes.push(studentFrames.length - 1);
    return indexes.map((index) => [
      PitchChartBuilderService.round(index * frameSec),
      PitchChartBuilderService.round(studentFrames[index] * frameSec)
    ]);
  }

  private static round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
