import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AssignmentAssignPolicyService from './AssignmentAssignPolicyService.ts';

const SEMESTER = 'HK1 2026-2027';

function source(overrides: Partial<Backend.AssignPlanSource> = {}): Backend.AssignPlanSource {
  return { id: 's1', cohort: SEMESTER, title: 'Lý ngựa ô', kind: 'BONUS', sheetMusicId: null, ...overrides };
}

function target(overrides: Partial<Backend.AssignPlanTarget> = {}): Backend.AssignPlanTarget {
  return { id: 'c1', cohort: SEMESTER, status: 'ACTIVE', instrumentId: 'i1', isLecturer: true, existing: [], ...overrides };
}

function plan(sources: Backend.AssignPlanSource[], targets: Backend.AssignPlanTarget[], options: { name?: string | null; sheets?: string[] } = {}): Backend.AssignPlan {
  return AssignmentAssignPolicyService.plan({
    sources,
    targets,
    currentSemesterName: options.name === undefined ? SEMESTER : options.name,
    selectableSheets: new Set(options.sheets ?? [])
  });
}

describe('AssignmentAssignPolicyService.plan', () => {
  it('tạo bản sao cho lớp hợp lệ', () => {
    assert.deepEqual(plan([source()], [target()]), { toCreate: [{ sourceId: 's1', classId: 'c1' }], skipped: [] });
  });

  it('bỏ qua lớp không thuộc giảng viên', () => {
    assert.deepEqual(plan([source()], [target({ isLecturer: false })]).skipped, [{ assignmentId: 's1', classId: 'c1', reason: 'NOT_CLASS_LECTURER' }]);
  });

  it('bỏ qua lớp ngoài học kỳ hiện tại', () => {
    assert.equal(plan([source()], [target({ cohort: 'HK2 2025-2026' })]).skipped[0]?.reason, 'NOT_CURRENT_SEMESTER');
  });

  it('bỏ qua bài nguồn thuộc học kỳ cũ dù lớp đích hợp lệ', () => {
    const result = plan([source({ cohort: 'HK2 2025-2026' })], [target()]);
    assert.deepEqual(result.skipped, [{ assignmentId: 's1', classId: 'c1', reason: 'NOT_CURRENT_SEMESTER' }]);
    assert.equal(result.toCreate.length, 0);
  });

  it('bỏ qua tất cả khi không có học kỳ hiện tại', () => {
    const result = plan([source()], [target(), target({ id: 'c2' })], { name: null });
    assert.deepEqual(result.skipped.map((item) => item.reason), ['NOT_CURRENT_SEMESTER', 'NOT_CURRENT_SEMESTER']);
    assert.equal(result.toCreate.length, 0);
  });

  it('bỏ qua lớp đã kết thúc', () => {
    assert.equal(plan([source()], [target({ status: 'ENDED' })]).skipped[0]?.reason, 'CLASS_NOT_ACTIVE');
  });

  it('bỏ qua khi sheet không dùng được cho nhạc cụ của lớp', () => {
    assert.equal(plan([source({ sheetMusicId: 'sh1' })], [target()]).skipped[0]?.reason, 'SHEET_UNAVAILABLE');
  });

  it('cho qua khi sheet dùng được cho nhạc cụ của lớp', () => {
    assert.equal(plan([source({ sheetMusicId: 'sh1' })], [target()], { sheets: ['sh1:i1'] }).toCreate.length, 1);
  });

  it('bỏ qua khi lớp đã có bài cùng nhóm (không phân biệt hoa thường, khoảng trắng)', () => {
    const existing = [{ title: '  lý NGỰA ô ', kind: 'BONUS' as const, sheetMusicId: null }];
    assert.equal(plan([source()], [target({ existing })]).skipped[0]?.reason, 'ALREADY_ASSIGNED');
  });

  it('bài SOLO cùng nhóm đã có thì báo ALREADY_ASSIGNED chứ không phải KIND_SLOT_TAKEN', () => {
    const existing = [{ title: 'Lý ngựa ô', kind: 'SOLO' as const, sheetMusicId: null }];
    assert.equal(plan([source({ kind: 'SOLO' })], [target({ existing })]).skipped[0]?.reason, 'ALREADY_ASSIGNED');
  });

  it('bài SOLO khác đã có thì báo KIND_SLOT_TAKEN', () => {
    const existing = [{ title: 'Bài khác', kind: 'SOLO' as const, sheetMusicId: null }];
    assert.equal(plan([source({ kind: 'SOLO' })], [target({ existing })]).skipped[0]?.reason, 'KIND_SLOT_TAKEN');
  });

  it('BONUS và OTHER không giới hạn số lượng', () => {
    const result = plan([source({ id: 's1', title: 'A' }), source({ id: 's2', title: 'B', kind: 'OTHER' })], [target({ existing: [{ title: 'C', kind: 'BONUS', sheetMusicId: null }] })]);
    assert.equal(result.toCreate.length, 2);
  });

  it('hai bài SOLO vào cùng một lớp trong một yêu cầu: chỉ bài đầu được tạo', () => {
    const result = plan([source({ id: 's1', title: 'A', kind: 'SOLO' }), source({ id: 's2', title: 'B', kind: 'SOLO' })], [target()]);
    assert.deepEqual(result.toCreate, [{ sourceId: 's1', classId: 'c1' }]);
    assert.deepEqual(result.skipped, [{ assignmentId: 's2', classId: 'c1', reason: 'KIND_SLOT_TAKEN' }]);
  });

  it('cùng một bài xuất hiện hai lần: lần sau báo ALREADY_ASSIGNED', () => {
    const result = plan([source(), source()], [target()]);
    assert.equal(result.toCreate.length, 1);
    assert.equal(result.skipped[0]?.reason, 'ALREADY_ASSIGNED');
  });

  it('không làm thay đổi dữ liệu đầu vào', () => {
    const input = target();
    plan([source()], [input]);
    assert.equal(input.existing.length, 0);
  });
});

describe('AssignmentAssignPolicyService.groupKey', () => {
  it('chuẩn hóa tiêu đề, giữ nguyên loại và sheet', () => {
    assert.equal(
      AssignmentAssignPolicyService.groupKey({ title: ' Lý Ngựa Ô ', kind: 'SOLO', sheetMusicId: null }),
      AssignmentAssignPolicyService.groupKey({ title: 'lý ngựa ô', kind: 'SOLO', sheetMusicId: null })
    );
    assert.notEqual(
      AssignmentAssignPolicyService.groupKey({ title: 'a', kind: 'SOLO', sheetMusicId: null }),
      AssignmentAssignPolicyService.groupKey({ title: 'a', kind: 'ENSEMBLE', sheetMusicId: null })
    );
  });
});
