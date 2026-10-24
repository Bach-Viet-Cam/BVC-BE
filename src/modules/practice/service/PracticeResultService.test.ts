import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeResultDTO from '../dto/PracticeResultDTO.ts';
import ClassRankService from './ClassRankService.ts';
import PitchChartService from './PitchChartService.ts';
import PracticeResultService from './PracticeResultService.ts';
import type RhythmClientService from '../../audio/service/RhythmClientService.ts';
import type PracticeResultRepository from '../repository/PracticeResultRepository.ts';

// A real Rhythm result from staging: silent recording, Gemini unavailable, two quality warnings
const silentResult = {
  pitchAccuracyPercent: 0.0, rhythmAccuracyPercent: 0.0, overallScore: 0.0, meanDeviationCents: null,
  rhythmSegments: [{ startTime: 0.0, endTime: 2.0, status: 'missing' }, { startTime: 2.0, endTime: 3.99, status: 'missing' }],
  pitchErrorSegments: [], instrumentId: 'dan_nhi', instrument: 'Đàn Nhị', teacherTempoBpm: 58.7, studentTempoBpm: 99.4,
  aiFeedback: PracticeConstant.fallbackFeedback,
  studentAudioQuality: {
    verdict: 'WARN',
    warnings: [{ code: 'AUDIO_LOW_LEVEL', message: 'Âm lượng bản thu nhỏ, hãy kiểm tra khoảng cách tới micro.' }],
    audio: { sampleRate: 48000, channels: 1, durationSec: 19.800666666666668 }
  }
};

const baseRecord: Practice.ResultRecord = {
  id: 'sub-3', studentId: 'student', pieceId: 'piece-1', sheetMusicId: 'sheet-1', assignmentId: 'asg-1', status: 'COMPLETED',
  accuracy: 83.41, aiFeedback: 'Chào em, cao độ rất tốt.', pitchChart: null, evaluationId: 'eval-3', fileDeletedAt: null,
  analyzedAt: new Date('2026-10-24T07:33:00Z'), createdAt: new Date('2026-10-24T07:32:00Z'),
  result: {
    pitchAccuracyPercent: 99.01, rhythmAccuracyPercent: 60.0, overallScore: 83.41, teacherTempoBpm: 129.2, studentTempoBpm: 58.7,
    rhythmSegments: [{ startTime: 33.95, endTime: 35.94, status: 'fast' }, { startTime: 0.0, endTime: 2.0, status: 'fast' }],
    pitchErrorSegments: [{ startTime: 12.4, endTime: 13.1, averageCentsDifference: -24.4 }],
    aiFeedback: 'Chào em, cao độ rất tốt.'
  },
  piece: { id: 'piece-1', title: 'Lý ngựa ô' },
  sheetMusic: { id: 'sheet-1', name: 'Bản chính', referenceAudio: { storageKey: 'media/teacher.wav', status: 'READY' } },
  assignment: { id: 'asg-1', title: 'Bài tuần 3', classId: 'class-1', class: { name: 'TRD301' } },
  studentUpload: { url: 'https://be/uploads/s.wav', deletingAt: null }
};

interface SetupOptions {
  record?: Practice.ResultRecord | null;
  attempts?: Practice.AttemptRecord[];
  total?: number;
  peers?: number[];
  analysis?: unknown;
}

function setup(options: SetupOptions = {}) {
  const saved: Practice.PitchChartDTO[] = [];
  const analysisCalls: string[] = [];
  const repository = {
    findOwnedResult: async () => (options.record === undefined ? baseRecord : options.record),
    countCompletedUntil: async () => options.total ?? 3,
    findCompletedAttempts: async () => options.attempts ?? [],
    findClassPeerBest: async () => options.peers ?? [],
    savePitchChart: async (_id: string, chart: Practice.PitchChartDTO) => { saved.push(chart); }
  } as unknown as PracticeResultRepository;
  const client = {
    getAnalysis: async (evaluationId: string) => { analysisCalls.push(evaluationId); return options.analysis ?? null; }
  } as unknown as RhythmClientService;
  const service = new PracticeResultService({
    repository, pitchCharts: new PitchChartService(repository, client), classRank: new ClassRankService(),
    createReadUrl: (key) => `https://be/uploads/${key}`
  });
  return { service, saved, analysisCalls };
}

const hasStatus = (statusCode: number) => (error: unknown) => error instanceof AppError && error.statusCode === statusCode;

test('Kết quả gồm điểm tổng, điểm thành phần, tempo đã chỉnh lỗi nửa nhịp, nhận xét AI, lỗi và audio', async () => {
  const result = await setup().service.getResult('student', 'sub-3');
  assert.deepEqual(result.submission, {
    id: 'sub-3', status: 'COMPLETED', submittedAt: '2026-10-24T07:32:00.000Z', analyzedAt: '2026-10-24T07:33:00.000Z', attemptNo: 3
  });
  // 58.7 BPM is half of ~117: beat tracking halved it, so the deviation is read against 2 × 58.7
  assert.deepEqual(result.tempo, { teacherBpm: 129.2, studentBpm: 58.7, deviationPercent: -9.1 });
  assert.deepEqual(result.scores, { overall: 83, pitch: 99, rhythm: 60, tempo: 82 });
  assert.deepEqual(result.aiFeedback, { text: 'Chào em, cao độ rất tốt.', isFallback: false });
  assert.deepEqual(result.issues.map((issue) => [issue.id, issue.startSec, issue.label]), [
    ['r1', 0, 'Nhanh hơn bản mẫu'], ['p0', 12.4, 'Lệch -24¢'], ['r0', 33.95, 'Nhanh hơn bản mẫu']
  ]);
  assert.deepEqual(result.audio, { teacherUrl: 'https://be/uploads/media/teacher.wav', studentUrl: 'https://be/uploads/s.wav' });
  assert.deepEqual(result.assignment, { id: 'asg-1', title: 'Bài tuần 3', classId: 'class-1' });
});

test('Bản thu im lặng: điểm 0, nhận xét dự phòng được đánh dấu, cảnh báo chất lượng và thời lượng được trả về', async () => {
  const { service } = setup({ record: { ...baseRecord, accuracy: 0, aiFeedback: null, result: silentResult } });
  const result = await service.getResult('student', 'sub-3');
  // 99.4 vs 58.7 BPM folds to 99.4 vs 117.4 → -15.3 % → tempo score 69
  assert.deepEqual(result.scores, { overall: 0, pitch: 0, rhythm: 0, tempo: 69 });
  assert.equal(result.tempo?.deviationPercent, -15.3);
  assert.equal(result.aiFeedback?.isFallback, true);
  assert.equal(result.recording.durationSec, 19.8);
  assert.deepEqual(result.qualityWarnings.map((warning) => warning.code), ['AUDIO_LOW_LEVEL']);
  assert.deepEqual(result.issues.map((issue) => issue.rhythmStatus), ['missing', 'missing']);
});

test('Bản nộp đang xử lý chỉ trả thông tin nhận diện; kết quả JSON hỏng không làm lỗi màn hình', async () => {
  const processing = await setup({ record: { ...baseRecord, status: 'PROCESSING', accuracy: null, result: null } }).service.getResult('student', 'sub-3');
  assert.equal(processing.scores, null);
  assert.deepEqual(processing.issues, []);
  assert.equal(processing.submission.attemptNo, 0);
  const broken = await setup({ record: { ...baseRecord, accuracy: null, aiFeedback: null, result: 'not json' } }).service.getResult('student', 'sub-3');
  assert.deepEqual(broken.scores, { overall: 0, pitch: 0, rhythm: 0, tempo: null });
  assert.equal(broken.aiFeedback, null);
});

test('File bản thu đã xóa thì không trả link nghe bản thu', async () => {
  const result = await setup({ record: { ...baseRecord, fileDeletedAt: new Date() } }).service.getResult('student', 'sub-3');
  assert.equal(result.audio.studentUrl, null);
  assert.ok(result.audio.teacherUrl);
});

test('Không phải bài của học viên trả 404; lịch sử, xếp hạng và biểu đồ của bài chưa xong trả 409', async () => {
  await assert.rejects(setup({ record: null }).service.getResult('student', 'sub-x'), hasStatus(404));
  const { service } = setup({ record: { ...baseRecord, status: 'PROCESSING' } });
  await assert.rejects(service.getHistory('student', 'sub-3'), hasStatus(409));
  await assert.rejects(service.getClassRank('student', 'sub-3'), hasStatus(409));
  await assert.rejects(service.getPitchChart('student', 'sub-3'), hasStatus(409));
});

test('Tiến trình: các lần nộp cũ trước, đánh số theo tổng số lần, chênh lệch so với lần trước', async () => {
  const attempts: Practice.AttemptRecord[] = [
    { id: 'sub-3', accuracy: 82, createdAt: new Date('2026-10-24T07:32:00Z') },
    { id: 'sub-2', accuracy: 74, createdAt: new Date('2026-10-24T04:20:00Z') }
  ];
  const history = await setup({ attempts, total: 3 }).service.getHistory('student', 'sub-3');
  assert.deepEqual(history.attempts.map((attempt) => [attempt.attemptNo, attempt.accuracyPercent, attempt.isCurrent]), [[2, 74, false], [3, 82, true]]);
  assert.equal(history.deltaPercent, 8);
  assert.equal(history.bestPercent, 82);
  assert.equal(history.isFirstAttempt, false);
  const first = await setup({ attempts: [attempts[0]], total: 1 }).service.getHistory('student', 'sub-3');
  assert.equal(first.isFirstAttempt, true);
  assert.equal(first.deltaPercent, null);
});

test('Xếp hạng lớp chỉ có khi bài nộp thuộc bài tập của lớp', async () => {
  assert.equal(await setup({ record: { ...baseRecord, assignmentId: null, assignment: null } }).service.getClassRank('student', 'sub-3'), null);
  const rank = await setup({ peers: [60, 70, 90] }).service.getClassRank('student', 'sub-3');
  assert.equal(rank?.className, 'TRD301');
  assert.equal(rank?.betterThanPercent, 67);
});

test('Biểu đồ cao độ: dựng từ file phân tích rồi lưu lại; lần sau dùng bản đã lưu, không gọi Rhythm', async () => {
  const analysis = {
    pitch: { sampleRate: 22050, hopLength: 512, teacherF0Hz: [392, 392], studentF0Hz: [380] },
    alignment: { studentFrameByTeacherFrame: [0, 0] }
  };
  const fresh = setup({ analysis });
  const chart = await fresh.service.getPitchChart('student', 'sub-3');
  assert.deepEqual(chart.points.map(([, teacher, student]) => [teacher, student]), [[392, 380], [392, 380]]);
  assert.equal(fresh.saved.length, 1);
  const cached = setup({ record: { ...baseRecord, pitchChart: chart } });
  assert.deepEqual(await cached.service.getPitchChart('student', 'sub-3'), chart);
  assert.deepEqual(cached.analysisCalls, []);
});

test('MSG-26: Rhythm không có file phân tích thì trả 422, các phần khác không bị ảnh hưởng', async () => {
  await assert.rejects(setup({ analysis: null }).service.getPitchChart('student', 'sub-3'), (error) => (
    error instanceof AppError && error.statusCode === 422 && error.message === PracticeConstant.messages.PITCH_UNAVAILABLE
  ));
});

test('Độ lệch tempo: chọn cách đọc gần tempo bản mẫu nhất khi máy đo nhịp bắt nhầm gấp đôi / một nửa', () => {
  assert.equal(PracticeResultDTO.toTempoDeviation(100, 95), -5);
  assert.equal(PracticeResultDTO.toTempoDeviation(60, 126), 5);
  assert.equal(PracticeResultDTO.toTempoDeviation(0, 95), null);
  assert.equal(PracticeResultDTO.toTempoDeviation(null, 95), null);
});
