import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import PracticeContextService from './PracticeContextService.ts';
import type PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';

const now = new Date('2026-10-22T10:00:00Z');
const sheet: Practice.ContextSheet = {
  id: 'sheet-1', pieceId: 'piece-1', instrumentId: 'inst-violin', kind: 'MAIN', name: 'Bản chính', durationSec: 120, analysisStatus: 'READY', analysisJobId: 'analysis-1', analysisFileUrl: 'analysis.json',
  referenceAudio: null, instrument: { id: 'inst-violin', code: 'violin', name: 'Violin' }, level: { id: 'lv-1', name: 'Cơ bản' },
  piece: { id: 'piece-1', title: 'Lý ngựa ô', bpm: 90 }
};
const enrollment: Practice.ClassAssignments = {
  classRecord: { id: 'class-1', name: 'Lớp Violin K18A', status: 'ACTIVE', instrumentId: 'inst-violin' },
  assignments: [{
    id: 'asg-1', title: 'Bài 3', description: '', status: 'PUBLISHED', deadline: new Date('2026-10-28'), maxSubmissions: 3, targetBpm: null,
    currentVersionId: 'v1', currentVersion: { kind: 'SOLO' }, submissions: [{ status: 'COMPLETED' }, { status: 'FAILED' }]
  }]
};
const query = { sheetMusicId: 'sheet-1' };

function service(options: { sheet?: Practice.ContextSheet | null; enrollment?: Practice.ClassAssignments | null }) {
  const repository = {
    findContextSheet: async () => (options.sheet === undefined ? sheet : options.sheet),
    findClassAssignments: async () => (options.enrollment === undefined ? enrollment : options.enrollment)
  } as unknown as PracticeSubmissionRepository;
  return new PracticeContextService(repository, () => now);
}

test('Sinh viên trong lớp mở bản chính: trả bài tập với lượt còn lại và tốc độ mặc định của bài nhạc', async () => {
  const context = await service({}).get('student', query);
  assert.equal(context.enrollment, 'IN_CLASS');
  assert.equal(context.classRecord?.name, 'Lớp Violin K18A');
  assert.equal(context.sheet.instrument.name, 'Violin');
  assert.deepEqual(context.sheet.practice, { isAvailable: true, reason: null });
  assert.equal(context.assignment?.usedSubmissions, 1); // FAILED does not count
  assert.equal(context.assignment?.remainingSubmissions, 2);
  assert.equal(context.assignment?.targetBpm, 90);
  assert.equal(context.assignment?.countsTowardAssignment, true);
});

test('Chưa có lớp thì NO_CLASS, bản không phải MAIN thì không có bài tập', async () => {
  const noClass = await service({ enrollment: null }).get('student', query);
  assert.equal(noClass.enrollment, 'NO_CLASS');
  assert.equal(noClass.classRecord, null);
  assert.equal(noClass.assignment, null);
  const level = await service({ sheet: { ...sheet, kind: 'LEVEL' } }).get('student', query);
  assert.equal(level.enrollment, 'IN_CLASS');
  assert.equal(level.assignment, null);
  assert.equal(level.sheet.practice.isAvailable, false);
});

test('Lớp đã kết thúc vẫn trả hạn nộp nhưng không còn tính vào bài tập; bản không tồn tại trả 404', async () => {
  const ended = await service({ enrollment: { ...enrollment, classRecord: { ...enrollment.classRecord, status: 'ENDED' } } }).get('student', query);
  assert.equal(ended.assignment?.state, 'ENDED');
  assert.equal(ended.assignment?.countsTowardAssignment, false);
  assert.ok(ended.assignment?.deadline);
  await assert.rejects(service({ sheet: null }).get('student', query), (error) => error instanceof AppError && error.statusCode === 404);
});
