import { test } from 'node:test';
import assert from 'node:assert/strict';
import PracticeAssignmentResolver from './PracticeAssignmentResolver.ts';

const now = new Date('2026-10-22T10:00:00Z');
const sheet = { kind: 'MAIN' as const, instrumentId: 'inst-violin' };
const candidate = (id: string, changes: Partial<Practice.AssignmentCandidate> = {}): Practice.AssignmentCandidate => ({
  id, title: id, description: '', status: 'PUBLISHED', deadline: new Date('2026-12-01'), maxSubmissions: 3, targetBpm: null,
  currentVersionId: `${id}-v1`, currentVersion: { kind: 'SOLO' }, submissions: [], ...changes
});
const enroll = (assignments: Practice.AssignmentCandidate[], status: Backend.ClassStatus = 'ACTIVE', memberInstrumentId = 'inst-violin'): Practice.ClassAssignments => ({
  classRecord: { id: 'class-1', name: 'Violin K18A', status, instrumentId: 'inst-violin' },
  assignments,
  memberInstrumentId
});

test('Không có lớp hoặc không có bài tập thì không khớp', () => {
  assert.equal(PracticeAssignmentResolver.resolve(sheet, null, now), null);
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enroll([]), now), null);
});

test('Chỉ bản MAIN của nhạc cụ lớp mới khớp bài tập', () => {
  const enrollment = enroll([candidate('a')]);
  assert.equal(PracticeAssignmentResolver.resolve({ ...sheet, kind: 'LEVEL' }, enrollment, now), null);
  assert.equal(PracticeAssignmentResolver.resolve({ ...sheet, instrumentId: 'inst-erhu' }, enrollment, now), null);
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enrollment, now)?.state, 'OPEN');
});

test('Trạng thái: còn lượt, hết lượt, quá hạn, bài tập đã đóng, lớp đã kết thúc', () => {
  const state = (item: Practice.AssignmentCandidate, classStatus: Backend.ClassStatus = 'ACTIVE') =>
    PracticeAssignmentResolver.resolve(sheet, enroll([item], classStatus), now)?.state;
  assert.equal(state(candidate('a')), 'OPEN');
  assert.equal(state(candidate('a', { submissions: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'PROCESSING' }] })), 'EXHAUSTED');
  assert.equal(state(candidate('a', { deadline: new Date('2026-10-01') })), 'ENDED');
  assert.equal(state(candidate('a', { status: 'CLOSED' })), 'ENDED');
  assert.equal(state(candidate('a'), 'ENDED'), 'ENDED');
});

test('Nhiều bài tập: ưu tiên assignmentId gợi ý, rồi bài còn mở có hạn gần nhất, rồi bài mới nhất', () => {
  const near = candidate('near', { deadline: new Date('2026-11-01') });
  const far = candidate('far', { deadline: new Date('2026-12-01') });
  const done = candidate('done', { deadline: new Date('2026-10-05') });
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enroll([far, near, done]), now)?.candidate.id, 'near');
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enroll([far, near]), now, 'far')?.candidate.id, 'far');
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enroll([done]), now)?.candidate.id, 'done');
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enroll([far, near]), now, 'missing')?.candidate.id, 'near');
});

test('Bài nộp hòa tấu chỉ ghép bài tập loại Hòa tấu', () => {
  const enrollment = enroll([
    candidate('solo', { deadline: new Date('2026-11-01') }),
    candidate('ensemble', { deadline: new Date('2026-11-20'), currentVersion: { kind: 'ENSEMBLE' } })
  ]);
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enrollment, now, undefined, 'ENSEMBLE')?.candidate.id, 'ensemble');
  // Gợi ý sai loại cũng không được ghép
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enrollment, now, 'solo', 'ENSEMBLE')?.candidate.id, 'ensemble');
});

test('Bài nộp độc tấu không bao giờ ghép bài tập Hòa tấu', () => {
  const enrollment = enroll([candidate('ensemble', { currentVersion: { kind: 'ENSEMBLE' } })]);
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enrollment, now), null);
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enrollment, now, 'ensemble'), null);
});

test('Bài tập không có phiên bản hiện tại coi như không phải Hòa tấu', () => {
  const enrollment = enroll([candidate('legacy', { currentVersion: null, currentVersionId: null })]);
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enrollment, now)?.candidate.id, 'legacy');
  assert.equal(PracticeAssignmentResolver.resolve(sheet, enrollment, now, undefined, 'ENSEMBLE'), null);
});

test('Sinh viên ở nhiều lớp: chọn lớp chứa bài tập được chỉ định, rồi lớp cùng nhạc cụ đã giao bài này', () => {
  const other: Practice.ClassAssignments = { classRecord: { id: 'class-2', name: 'Đàn nhị', status: 'ACTIVE', instrumentId: 'inst-nhi' }, assignments: [], memberInstrumentId: 'inst-nhi' };
  const sameEmpty: Practice.ClassAssignments = { ...enroll([]), classRecord: { ...enroll([]).classRecord, id: 'class-3' } };
  const assigned = enroll([candidate('asg-1')]);
  assert.equal(PracticeAssignmentResolver.pickEnrollment([other, sameEmpty, assigned], sheet, 'asg-1'), assigned);
  assert.equal(PracticeAssignmentResolver.pickEnrollment([other, sameEmpty, assigned], sheet), assigned);
  assert.equal(PracticeAssignmentResolver.pickEnrollment([other, sameEmpty], sheet), sameEmpty);
  assert.equal(PracticeAssignmentResolver.pickEnrollment([other], sheet), other);
  assert.equal(PracticeAssignmentResolver.pickEnrollment([], sheet), null);
});

test('Hòa tấu: bản nhạc theo nhạc cụ của thành viên được tính dù khác nhạc cụ lớp', () => {
  const enrollment = { ...enroll([candidate('ens', { currentVersion: { kind: 'ENSEMBLE' } })]), memberInstrumentId: 'inst-erhu' };
  assert.equal(PracticeAssignmentResolver.resolve({ kind: 'MAIN', instrumentId: 'inst-erhu' }, enrollment, now, undefined, 'ENSEMBLE')?.candidate.id, 'ens');
  assert.equal(PracticeAssignmentResolver.resolve({ kind: 'MAIN', instrumentId: 'inst-violin' }, enrollment, now, undefined, 'ENSEMBLE'), null);
});

test('Độc tấu: giữ luật cũ theo nhạc cụ lớp', () => {
  const enrollment = { ...enroll([candidate('solo')]), memberInstrumentId: 'inst-erhu' };
  assert.equal(PracticeAssignmentResolver.resolve({ kind: 'MAIN', instrumentId: 'inst-violin' }, enrollment, now)?.candidate.id, 'solo');
  assert.equal(PracticeAssignmentResolver.resolve({ kind: 'MAIN', instrumentId: 'inst-erhu' }, enrollment, now), null);
});
