import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import PracticeSettingsService from './PracticeSettingsService.ts';
import type PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';

const now = new Date('2026-10-22T10:00:00Z');
const sheet: Practice.ContextSheet = {
  id: 'sheet-1', pieceId: 'piece-1', instrumentId: 'inst-nhi', kind: 'MAIN', name: 'Bản chính', durationSec: 120,
  analysisStatus: 'READY', analysisJobId: 'analysis-1', analysisFileUrl: 'analysis.json', referenceAudio: null,
  instrument: { id: 'inst-nhi', code: 'DNH', name: 'Đàn nhị' }, level: { id: 'lv-1', name: 'Cơ bản' },
  piece: { id: 'piece-1', title: 'Jingle Bell', bpm: 120 }
};
const candidate = (targetBpm: number | null): Practice.AssignmentCandidate => ({
  id: 'asg-1', title: 'Bài Độc Tấu 1', description: '', status: 'PUBLISHED', deadline: new Date('2026-12-18'), maxSubmissions: 3,
  targetBpm, currentVersionId: 'v1', currentVersion: { kind: 'SOLO' }, submissions: []
});
const enrollment = (targetBpm: number | null, instrumentId = 'inst-nhi'): Practice.ClassAssignments => ({
  classRecord: { id: 'class-1', name: 'DNH103.M1.H1', status: 'ACTIVE', instrumentId },
  memberInstrumentId: instrumentId,
  assignments: [candidate(targetBpm)]
});

function setup(options: {
  sheet?: Practice.ContextSheet | null;
  enrollments?: Practice.ClassAssignments[];
  tunes?: Practice.InstrumentTuneRow[];
} = {}) {
  const tuneCalls: string[] = [];
  const repository = {
    findContextSheet: async () => (options.sheet === undefined ? sheet : options.sheet),
    findClassAssignments: async () => options.enrollments ?? [],
    findInstrumentTunes: async (instrumentId: string) => {
      tuneCalls.push(instrumentId);
      return options.tunes ?? [];
    }
  } as unknown as PracticeSubmissionRepository;
  return { service: new PracticeSettingsService(repository, () => now), tuneCalls };
}

const query = { sheetMusicId: 'sheet-1' };

test('Tốc độ luyện: lấy BPM của bài tập khi bản nhạc được giao cho lớp của sinh viên', async () => {
  const { service } = setup({ enrollments: [enrollment(84)] });
  assert.deepEqual(await service.getTargetBpm('student', query), { targetBpm: 84, source: 'ASSIGNMENT', assignmentId: 'asg-1' });
});

test('Tốc độ luyện: mặc định 60 khi không thuộc lớp, bài không được giao hoặc bài tập chưa đặt BPM', async () => {
  const notInClass = await setup({ enrollments: [] }).service.getTargetBpm('student', query);
  assert.deepEqual(notInClass, { targetBpm: 60, source: 'DEFAULT', assignmentId: null });

  const notAssigned = await setup({ enrollments: [{ ...enrollment(84), assignments: [] }] }).service.getTargetBpm('student', query);
  assert.deepEqual(notAssigned, { targetBpm: 60, source: 'DEFAULT', assignmentId: null });

  // The class plays another instrument: this sheet is not its assigned sheet
  const otherInstrument = await setup({ enrollments: [enrollment(84, 'inst-tranh')] }).service.getTargetBpm('student', query);
  assert.equal(otherInstrument.source, 'DEFAULT');

  const noBpm = await setup({ enrollments: [enrollment(null)] }).service.getTargetBpm('student', query);
  assert.deepEqual(noBpm, { targetBpm: 60, source: 'DEFAULT', assignmentId: 'asg-1' });
});

test('Dây chuẩn: trả các dây của nhạc cụ thuộc bản nhạc, theo thứ tự hiển thị', async () => {
  const { service, tuneCalls } = setup({
    tunes: [
      { id: 't1', tuneName: 'Dây trong', pitch: 293.66, displayOrder: 1 },
      { id: 't2', tuneName: 'Dây ngoài', pitch: 440, displayOrder: 2 }
    ]
  });
  assert.deepEqual(await service.getTunes('sheet-1'), {
    instrument: { id: 'inst-nhi', name: 'Đàn nhị' },
    tunes: [
      { id: 't1', name: 'Dây trong', pitchHz: 293.66, displayOrder: 1 },
      { id: 't2', name: 'Dây ngoài', pitchHz: 440, displayOrder: 2 }
    ]
  });
  assert.deepEqual(tuneCalls, ['inst-nhi']);
});

test('Bản nhạc không tồn tại trả 404 cho cả hai API', async () => {
  const { service } = setup({ sheet: null });
  const isNotFound = (error: unknown) => error instanceof AppError && error.statusCode === 404;
  await assert.rejects(service.getTargetBpm('student', query), isNotFound);
  await assert.rejects(service.getTunes('sheet-x'), isNotFound);
});
