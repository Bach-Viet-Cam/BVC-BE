import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import SemesterPolicyService from './SemesterPolicyService.ts';

const semester: Backend.Semester = { name: 'HK1 2026-2027', startDate: '2026-09-01', endDate: '2027-01-15' };
const other: Backend.Semester = { name: 'HK2 2026-2027', startDate: '2027-02-01', endDate: '2027-06-30' };

describe('SemesterPolicyService.findCurrent', () => {
  it('trả học kỳ chứa hôm nay', () => {
    assert.equal(SemesterPolicyService.findCurrent([semester, other], new Date('2026-11-10T05:00:00Z')), semester);
  });
  it('tính cả ngày bắt đầu (giờ Việt Nam)', () => {
    assert.equal(SemesterPolicyService.findCurrent([semester], new Date('2026-08-31T17:30:00Z')), semester);
  });
  it('tính cả ngày kết thúc (giờ Việt Nam)', () => {
    assert.equal(SemesterPolicyService.findCurrent([semester], new Date('2027-01-15T16:30:00Z')), semester);
  });
  it('trả null khi qua ngày kết thúc', () => {
    assert.equal(SemesterPolicyService.findCurrent([semester], new Date('2027-01-15T17:30:00Z')), null);
  });
  it('trả null khi chưa có học kỳ nào', () => {
    assert.equal(SemesterPolicyService.findCurrent([], new Date('2026-11-10T05:00:00Z')), null);
  });
  it('không lấy học kỳ gần nhất khi nằm giữa hai học kỳ', () => {
    assert.equal(SemesterPolicyService.findCurrent([semester, other], new Date('2027-01-25T05:00:00Z')), null);
  });
});

describe('SemesterPolicyService.resolveEmptyReason', () => {
  it('chưa cấu hình học kỳ', () => {
    assert.equal(SemesterPolicyService.resolveEmptyReason({ semesters: [], current: null, classCount: 0 }), 'NO_SEMESTER_CONFIGURED');
  });
  it('hôm nay không thuộc học kỳ nào', () => {
    assert.equal(SemesterPolicyService.resolveEmptyReason({ semesters: [semester], current: null, classCount: 0 }), 'NO_CURRENT_SEMESTER');
  });
  it('giảng viên chưa có lớp trong học kỳ', () => {
    assert.equal(SemesterPolicyService.resolveEmptyReason({ semesters: [semester], current: semester, classCount: 0 }), 'NO_CLASSES_IN_SEMESTER');
  });
  it('có lớp thì không có lý do rỗng', () => {
    assert.equal(SemesterPolicyService.resolveEmptyReason({ semesters: [semester], current: semester, classCount: 2 }), null);
  });
});
