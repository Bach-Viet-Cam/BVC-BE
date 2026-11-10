import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import CatalogCategoryDTO from './CatalogCategoryDTO.ts';

const record = (counts: Backend.CatalogCategoryRecord['_count']): Backend.CatalogCategoryRecord => ({
  id: 'c1',
  type: 'GENRE',
  name: 'Dân ca',
  description: null,
  displayOrder: 1,
  status: 'ACTIVE',
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  _count: counts
});

describe('CatalogCategoryDTO.countUsage', () => {
  it('cộng số bài hát, bản nhạc và bài hát dùng trình độ cũ', () => {
    assert.equal(CatalogCategoryDTO.countUsage(record({ genrePieces: 3, levelSheetMusic: 2, legacyPieces: 1 })), 6);
  });

  it('bằng 0 khi chưa có nội dung nào dùng danh mục', () => {
    assert.equal(CatalogCategoryDTO.countUsage(record({ genrePieces: 0, levelSheetMusic: 0, legacyPieces: 0 })), 0);
  });
});

describe('CatalogCategoryDTO.toItem', () => {
  it('trả về số lượt dùng và thời gian cập nhật dạng ISO', () => {
    const item = CatalogCategoryDTO.toItem(record({ genrePieces: 2, levelSheetMusic: 0, legacyPieces: 0 }));
    assert.equal(item.usageCount, 2);
    assert.equal(item.updatedAt, '2026-11-02T00:00:00.000Z');
    assert.equal(item.type, 'GENRE');
  });
});
