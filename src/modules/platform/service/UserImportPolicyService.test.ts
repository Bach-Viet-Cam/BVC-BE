import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import UserImportPolicyService from './UserImportPolicyService.ts';

const user = (id: string, email: string, role: number, studentCode: string | null, username = 'Tên cũ'): Backend.UserAdminRecord => ({
  id, email, username, role, status: 'ACTIVE', studentCode, lastLoginAt: null
});
const row = (rowNumber: number, studentCode: string, username: string, email: string): Backend.UserImportRowInput => ({ rowNumber, studentCode, username, email });
const run = (rows: Backend.UserImportRowInput[], mode: Backend.ImportMode = 'skip', existing: Backend.UserAdminRecord[] = []): Backend.UserImportRowResult[] =>
  UserImportPolicyService.analyze({ rows, mode, existing });

describe('UserImportPolicyService.normalizeRow / lookupKeys', () => {
  it('chuẩn hóa email, họ tên; giữ nguyên chữ hoa/thường của mã SV', () => {
    const [result] = run([row(2, ' se170001 ', ' Nguyễn   Văn  A ', '  A@FPT.EDU.VN ')]);
    assert.equal(result.email, 'a@fpt.edu.vn');
    assert.equal(result.username, 'Nguyễn Văn A');
    assert.equal(result.studentCode, 'se170001');
    assert.equal(result.action, 'CREATE');
  });
  it('lookupKeys trả danh sách duy nhất, đã chuẩn hóa, bỏ giá trị rỗng', () => {
    const keys = UserImportPolicyService.lookupKeys([row(2, 'SE1', 'A', 'A@x.com'), row(3, 'SE1', 'B', 'a@x.com '), row(4, '', 'C', '')]);
    assert.deepEqual(keys, { emails: ['a@x.com'], codes: ['SE1'] });
  });
});

describe('UserImportPolicyService.analyze — kiểm tra từng dòng', () => {
  it('gom đủ các lỗi của một dòng', () => {
    const [result] = run([row(5, 'mã sai!', '', 'khong-phai-email')]);
    assert.equal(result.action, 'ERROR');
    assert.equal(result.messages.length, 3);
  });
  it('họ tên quá 100 ký tự → lỗi', () => {
    assert.equal(run([row(2, 'SE1', 'A'.repeat(101), 'a@x.com')])[0].action, 'ERROR');
  });
  it('họ tên có ký tự điều khiển → lỗi', () => {
    assert.equal(run([row(2, 'SE1', 'A\u0007B', 'a@x.com')])[0].action, 'ERROR');
  });
  it('mã SV dài hơn 20 ký tự → lỗi', () => {
    assert.equal(run([row(2, 'S'.repeat(21), 'A', 'a@x.com')])[0].action, 'ERROR');
  });
  it('thiếu mã SV → lỗi', () => {
    assert.equal(run([row(2, '', 'A', 'a@x.com')])[0].action, 'ERROR');
  });
});

describe('UserImportPolicyService.analyze — trùng trong file (D7)', () => {
  it('dòng sau bị lỗi và chỉ rõ dòng đầu; dòng đầu vẫn hợp lệ', () => {
    const results = run([row(2, 'SE1', 'A', 'a@x.com'), row(3, 'SE2', 'B', 'A@x.com'), row(4, 'SE1', 'C', 'c@x.com')]);
    assert.equal(results[0].action, 'CREATE');
    assert.equal(results[1].action, 'ERROR');
    assert.ok(results[1].messages[0].includes('dòng 2'));
    assert.equal(results[2].action, 'ERROR');
    assert.ok(results[2].messages[0].includes('dòng 2'));
  });
});

describe('UserImportPolicyService.analyze — đối chiếu DB', () => {
  const student = user('u1', 'a@x.com', 1, 'SE1');

  it('sinh viên đã có, chế độ skip → SKIP', () => {
    const [result] = run([row(2, 'SE1', 'Tên mới', 'a@x.com')], 'skip', [student]);
    assert.equal(result.action, 'SKIP');
    assert.equal(result.existingUserId, 'u1');
  });
  it('chế độ update + khác họ tên → UPDATE kèm lý do', () => {
    const [result] = run([row(2, 'SE1', 'Tên mới', 'a@x.com')], 'update', [student]);
    assert.equal(result.action, 'UPDATE');
    assert.ok(result.messages.some((message) => message.includes('họ tên')));
  });
  it('chế độ update + không đổi gì → SKIP', () => {
    const [result] = run([row(2, 'SE1', 'Tên cũ', 'a@x.com')], 'update', [student]);
    assert.equal(result.action, 'SKIP');
    assert.ok(result.messages[0].includes('Không có thay đổi'));
  });
  it('email của giảng viên → ERROR, kể cả chế độ update (Review Focus 3)', () => {
    const teacher = user('t1', 't@x.com', 2, null);
    const [result] = run([row(2, 'SE9', 'A', 't@x.com')], 'update', [teacher]);
    assert.equal(result.action, 'ERROR');
    assert.ok(result.messages[0].includes('giảng viên'));
  });
  it('email của admin → ERROR', () => {
    assert.equal(run([row(2, 'SE9', 'A', 'ad@x.com')], 'update', [user('ad', 'ad@x.com', 3, null)])[0].action, 'ERROR');
  });
  it('email mới nhưng mã SV của người khác → ERROR', () => {
    const [result] = run([row(2, 'SE1', 'A', 'moi@x.com')], 'skip', [student]);
    assert.equal(result.action, 'ERROR');
    assert.ok(result.messages[0].includes('đã được dùng'));
  });
  it('email là của sinh viên A nhưng mã SV là của sinh viên B → ERROR', () => {
    const other = user('u2', 'b@x.com', 1, 'SE9');
    const [result] = run([row(2, 'SE9', 'A', 'a@x.com')], 'update', [student, other]);
    assert.equal(result.action, 'ERROR');
  });
  it('email và mã SV cùng thuộc một sinh viên → không xung đột', () => {
    assert.equal(run([row(2, 'SE1', 'Tên cũ', 'a@x.com')], 'skip', [student])[0].action, 'SKIP');
  });
});

describe('UserImportPolicyService.summarize', () => {
  it('đếm đúng từng loại', () => {
    const results = run([row(2, 'SE1', 'A', 'a@x.com'), row(3, 'SE2', 'B', 'b@x.com'), row(4, 'x!', 'C', 'c@x.com')]);
    assert.deepEqual(UserImportPolicyService.summarize(results), { total: 3, create: 2, update: 0, skip: 0, error: 1 });
  });
  it('rỗng → toàn 0', () => {
    assert.deepEqual(UserImportPolicyService.summarize([]), { total: 0, create: 0, update: 0, skip: 0, error: 0 });
  });
});
