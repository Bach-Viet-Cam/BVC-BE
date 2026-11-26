import { test } from 'node:test';
import assert from 'node:assert/strict';
import ContentCategoryService from './ContentCategoryService.ts';
import CategoryPolicyService from './CategoryPolicyService.ts';
import ContentCategoryRepository from '../repository/ContentCategoryRepository.ts';
import AppError from '../../../utils/AppError.ts';

const category = (id: string, name: string, parentId: string | null = null, sortOrder = 0): Backend.ContentCategoryRecord => ({
  id, name, parentId, sortOrder
});

const row = (id: string, name: string, parentId: string | null, sortOrder: number, pieceCount: number): Backend.ContentCategoryRow => ({
  id, name, parentId, sortOrder, pieceCount
});

const isAppError = (statusCode: number, message: string) => (error: unknown) =>
  error instanceof AppError && error.statusCode === statusCode && error.message === message;

const NOT_FOUND = 'Không tìm thấy danh mục.';
const NAME_EXISTS = 'Tên danh mục đã tồn tại trong cùng cấp.';
const HAS_CHILDREN = 'Không thể xóa danh mục còn danh mục con.';
const HAS_PIECES = 'Không thể xóa danh mục còn bài nhạc. Hãy chuyển bài nhạc sang danh mục khác trước.';

test('UTC-CC-001 - normalizeName trims and collapses spaces', () => {
  assert.equal(CategoryPolicyService.normalizeName('  Điệu   lý  '), 'Điệu lý');
});

test('UTC-CC-002 - hasDuplicate ignores case and extra spaces', () => {
  assert.equal(CategoryPolicyService.hasDuplicate([category('c1', 'Điệu Lý')], 'điệu  lý'), true);
});

test('UTC-CC-003 - hasDuplicate skips the category being renamed', () => {
  assert.equal(CategoryPolicyService.hasDuplicate([category('c1', 'Điệu Lý')], 'Điệu lý', 'c1'), false);
});

test('UTC-CC-004 - hasDuplicate treats tone marks as different names', () => {
  assert.equal(CategoryPolicyService.hasDuplicate([category('c1', 'Điệu lý')], 'Điệu ly'), false);
});

test('UTC-CC-005 - canNest allows a level 1 parent', () => {
  assert.equal(CategoryPolicyService.canNest(category('c1', 'Dân ca')), true);
});

test('UTC-CC-006 - canNest rejects a level 2 parent', () => {
  assert.equal(CategoryPolicyService.canNest(category('c2', 'Lý', 'c1')), false);
});

test('UTC-CC-007 - canDelete checks children before pieces', () => {
  assert.deepEqual(CategoryPolicyService.canDelete({ childCount: 1, pieceCount: 5 }), { isAllowed: false, message: HAS_CHILDREN });
});

test('UTC-CC-008 - canDelete blocks a category that still has one piece', () => {
  assert.deepEqual(CategoryPolicyService.canDelete({ childCount: 0, pieceCount: 1 }), { isAllowed: false, message: HAS_PIECES });
});

test('UTC-CC-009 - canDelete allows an empty category', () => {
  assert.deepEqual(CategoryPolicyService.canDelete({ childCount: 0, pieceCount: 0 }), { isAllowed: true });
});

test('UTC-CC-010 - buildTree sorts nodes and sums child pieces into the parent', () => {
  const tree = CategoryPolicyService.buildTree([
    row('c2', 'Lý', 'c1', 1, 3),
    row('c1', 'Dân ca', null, 0, 2),
    row('c3', 'Hò', 'c1', 0, 1),
    row('c4', 'Nhạc lễ', null, 0, 0)
  ]);

  assert.deepEqual(tree, [
    {
      id: 'c1', name: 'Dân ca', pieceCount: 6,
      children: [{ id: 'c3', name: 'Hò', pieceCount: 1 }, { id: 'c2', name: 'Lý', pieceCount: 3 }]
    },
    { id: 'c4', name: 'Nhạc lễ', pieceCount: 0, children: [] }
  ]);
});

test('UTC-CC-011 - buildTree returns an empty tree for no rows', () => {
  assert.deepEqual(CategoryPolicyService.buildTree([]), []);
});

test('UTC-CC-012 - list builds the tree from repository rows', async (t) => {
  t.mock.method(ContentCategoryRepository, 'listRows', async () => [row('c1', 'Dân ca', null, 0, 0), row('c2', 'Lý', 'c1', 0, 0)]);

  const result = await ContentCategoryService.list();

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Dân ca');
  assert.deepEqual(result[0].children.map((child) => child.name), ['Lý']);
});

test('UTC-CC-013 - create a root category with trimmed name and next sort order', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findSiblings', async () => [category('c1', 'Dân ca', null, 0), category('c4', 'Nhạc lễ', null, 3)]);
  const createMock = t.mock.method(ContentCategoryRepository, 'create', async () => category('c5', 'Chèo', null, 4));

  const result = await ContentCategoryService.create({ name: '  Chèo  ' });

  assert.deepEqual(result, { id: 'c5', name: 'Chèo', parentId: null });
  assert.deepEqual(createMock.mock.calls[0].arguments[0], { name: 'Chèo', parentId: null, sortOrder: 4 });
});

test('UTC-CC-014 - create the first child of a root category with sort order 0', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c1', 'Dân ca'));
  t.mock.method(ContentCategoryRepository, 'findSiblings', async () => []);
  const createMock = t.mock.method(ContentCategoryRepository, 'create', async () => category('c3', 'Hò', 'c1', 0));

  const result = await ContentCategoryService.create({ name: 'Hò', parentId: 'c1' });

  assert.equal(result.name, 'Hò');
  assert.equal(result.parentId, 'c1');
  assert.equal(createMock.mock.calls[0].arguments[0]?.sortOrder, 0);
});

test('UTC-CC-015 - create under a level 2 parent is rejected with 400', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c2', 'Lý', 'c1'));
  const createMock = t.mock.method(ContentCategoryRepository, 'create', async () => category('c9', 'Lý con'));

  await assert.rejects(
    ContentCategoryService.create({ name: 'Lý con', parentId: 'c2' }),
    isAppError(400, 'Danh mục cha không hợp lệ: chỉ cho phép tối đa 2 cấp.')
  );
  assert.equal(createMock.mock.callCount(), 0);
});

test('UTC-CC-016 - create under a missing parent throws 404', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => null);

  await assert.rejects(ContentCategoryService.create({ name: 'Hò', parentId: 'c-x' }), isAppError(404, NOT_FOUND));
});

test('UTC-CC-017 - create with a duplicate sibling name throws 409', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findSiblings', async () => [category('c1', 'Dân ca')]);

  await assert.rejects(ContentCategoryService.create({ name: 'dân ca' }), isAppError(409, NAME_EXISTS));
});

test('UTC-CC-018 - rename checks siblings of the same parent then saves', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c2', 'Lý', 'c1', 1));
  const siblingsMock = t.mock.method(ContentCategoryRepository, 'findSiblings', async () => [category('c2', 'Lý', 'c1', 1), category('c3', 'Hò', 'c1', 0)]);
  const renameMock = t.mock.method(ContentCategoryRepository, 'rename', async () => category('c2', 'Điệu lý', 'c1', 1));

  const result = await ContentCategoryService.rename('c2', { name: 'Điệu lý' });

  assert.deepEqual(result, { id: 'c2', name: 'Điệu lý', parentId: 'c1' });
  assert.equal(siblingsMock.mock.calls[0].arguments[0], 'c1');
  assert.deepEqual(renameMock.mock.calls[0].arguments, ['c2', 'Điệu lý']);
});

test('UTC-CC-019 - rename to a sibling name throws 409', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c2', 'Lý', 'c1', 1));
  t.mock.method(ContentCategoryRepository, 'findSiblings', async () => [category('c2', 'Lý', 'c1', 1), category('c3', 'Hò', 'c1', 0)]);

  await assert.rejects(ContentCategoryService.rename('c2', { name: 'HÒ' }), isAppError(409, NAME_EXISTS));
});

test('UTC-CC-020 - rename that only changes letter case is allowed', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c2', 'Lý', 'c1', 1));
  t.mock.method(ContentCategoryRepository, 'findSiblings', async () => [category('c2', 'Lý', 'c1', 1)]);
  t.mock.method(ContentCategoryRepository, 'rename', async () => category('c2', 'LÝ', 'c1', 1));

  const result = await ContentCategoryService.rename('c2', { name: 'LÝ' });

  assert.equal(result.name, 'LÝ');
});

test('UTC-CC-021 - remove deletes an empty category', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c2', 'Lý', 'c1'));
  t.mock.method(ContentCategoryRepository, 'countChildren', async () => 0);
  t.mock.method(ContentCategoryRepository, 'countPieces', async () => 0);
  const removeMock = t.mock.method(ContentCategoryRepository, 'remove', async () => undefined);

  const result = await ContentCategoryService.remove('c2');

  assert.deepEqual(result, { id: 'c2' });
  assert.equal(removeMock.mock.calls[0].arguments[0], 'c2');
});

test('UTC-CC-022 - remove a category with children throws 409', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c1', 'Dân ca'));
  t.mock.method(ContentCategoryRepository, 'countChildren', async () => 2);
  t.mock.method(ContentCategoryRepository, 'countPieces', async () => 0);
  const removeMock = t.mock.method(ContentCategoryRepository, 'remove', async () => undefined);

  await assert.rejects(ContentCategoryService.remove('c1'), isAppError(409, HAS_CHILDREN));
  assert.equal(removeMock.mock.callCount(), 0);
});

test('UTC-CC-023 - remove a category with pieces throws 409', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => category('c2', 'Lý', 'c1'));
  t.mock.method(ContentCategoryRepository, 'countChildren', async () => 0);
  t.mock.method(ContentCategoryRepository, 'countPieces', async () => 3);

  await assert.rejects(ContentCategoryService.remove('c2'), isAppError(409, HAS_PIECES));
});

test('UTC-CC-024 - remove a missing category throws 404', async (t) => {
  t.mock.method(ContentCategoryRepository, 'findById', async () => null);

  await assert.rejects(ContentCategoryService.remove('c-x'), isAppError(404, NOT_FOUND));
});
