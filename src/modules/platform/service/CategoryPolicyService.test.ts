import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import CategoryPolicyService from './CategoryPolicyService.ts';

const record = (id: string, name: string, parentId: string | null = null, sortOrder = 0): Backend.ContentCategoryRecord => ({ id, name, parentId, sortOrder });
const row = (id: string, name: string, parentId: string | null, sortOrder: number, pieceCount: number): Backend.ContentCategoryRow => ({ id, name, parentId, sortOrder, pieceCount });

describe('CategoryPolicyService.normalizeName', () => {
  it('cắt khoảng trắng đầu/cuối và gộp khoảng trắng giữa', () => {
    assert.equal(CategoryPolicyService.normalizeName('  Dân   ca '), 'Dân ca');
  });
});

describe('CategoryPolicyService.hasDuplicate', () => {
  const siblings = [record('1', 'Dân ca'), record('2', 'Nhạc lễ')];
  it('trùng không phân biệt hoa thường và khoảng trắng thừa', () => {
    assert.equal(CategoryPolicyService.hasDuplicate(siblings, '  dân   CA '), true);
  });
  it('không trùng khi tên khác', () => {
    assert.equal(CategoryPolicyService.hasDuplicate(siblings, 'Cộng đồng'), false);
  });
  it('bỏ qua chính nó khi đổi tên', () => {
    assert.equal(CategoryPolicyService.hasDuplicate(siblings, 'Dân ca', '1'), false);
    assert.equal(CategoryPolicyService.hasDuplicate(siblings, 'Dân ca', '2'), true);
  });
});

describe('CategoryPolicyService.canNest', () => {
  it('cho phép đặt dưới danh mục gốc', () => {
    assert.equal(CategoryPolicyService.canNest(record('1', 'Dân ca', null)), true);
  });
  it('không cho đặt dưới danh mục con (tối đa 2 cấp)', () => {
    assert.equal(CategoryPolicyService.canNest(record('2', 'Quan họ', '1')), false);
  });
});

describe('CategoryPolicyService.canDelete', () => {
  it('cho xóa khi rỗng', () => {
    assert.deepEqual(CategoryPolicyService.canDelete({ childCount: 0, pieceCount: 0 }), { isAllowed: true });
  });
  it('chặn khi còn danh mục con', () => {
    const result = CategoryPolicyService.canDelete({ childCount: 2, pieceCount: 0 });
    assert.equal(result.isAllowed, false);
    assert.ok(result.message?.includes('danh mục con'));
  });
  it('chặn khi còn bài nhạc', () => {
    const result = CategoryPolicyService.canDelete({ childCount: 0, pieceCount: 1 });
    assert.equal(result.isAllowed, false);
    assert.ok(result.message?.includes('bài nhạc'));
  });
  it('khi cả hai: báo danh mục con trước', () => {
    assert.ok(CategoryPolicyService.canDelete({ childCount: 1, pieceCount: 1 }).message?.includes('danh mục con'));
  });
});

describe('CategoryPolicyService.buildTree', () => {
  const rows = [
    row('a', 'Dân ca', null, 1, 1),
    row('b', 'Cộng đồng', null, 0, 0),
    row('a1', 'Quan họ', 'a', 1, 2),
    row('a0', 'Dân ca Nam Bộ', 'a', 0, 3),
    row('x1', 'Mồ côi', 'khong-ton-tai', 0, 9)
  ];
  const tree = CategoryPolicyService.buildTree(rows);

  it('sắp theo sortOrder rồi tên, ở cả cấp gốc và cấp con', () => {
    assert.deepEqual(tree.map((node) => node.id), ['b', 'a']);
    assert.deepEqual(tree[1].children.map((child) => child.id), ['a0', 'a1']);
  });
  it('số bài của cha = trực tiếp + tổng các con', () => {
    assert.equal(tree[1].pieceCount, 1 + 3 + 2);
    assert.equal(tree[0].pieceCount, 0);
  });
  it('bỏ qua danh mục con mồ côi (cha không tồn tại)', () => {
    assert.equal(JSON.stringify(tree).includes('Mồ côi'), false);
  });
  it('rỗng → mảng rỗng', () => {
    assert.deepEqual(CategoryPolicyService.buildTree([]), []);
  });
});
