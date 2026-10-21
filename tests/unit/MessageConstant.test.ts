import { describe, expect, it } from 'vitest';
import MessageConstant from '../../src/constants/MessageConstant.ts';

describe('MessageConstant.format', () => {
  it('fills named placeholders', () => {
    expect(MessageConstant.format('MSG-45', { hợp_lệ: 31, bỏ_qua: 3 })).toBe('Đã nhập 31 sinh viên, bỏ qua 3 dòng không hợp lệ.');
    expect(MessageConstant.format('MSG-37', { field: 'Tên lớp', max: 100 })).toBe('Tên lớp không được vượt quá 100 ký tự.');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(MessageConstant.format('MSG-35')).toBe('{field} không được để trống.');
  });
});
