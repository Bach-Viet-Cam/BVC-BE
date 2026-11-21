import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import ClassMembershipRepository from '../repository/ClassMembershipRepository.ts';
import StudentClassService from './StudentClassService.ts';

const originalResolver = StudentClassService.activeInstrumentResolver;

describe('StudentClassService (Nhạc cụ của lớp đang học)', () => {
  afterEach(() => {
    StudentClassService.activeInstrumentResolver = originalResolver;
  });

  describe('findActiveInstrumentId', () => {
    it('trả về nhạc cụ của lớp đang học', async () => {
      const resolver = mock.fn(async (_studentId: string): Promise<string | null> => 'i-tranh');
      StudentClassService.activeInstrumentResolver = resolver;

      const result = await StudentClassService.findActiveInstrumentId('SV-1');

      assert.equal(result, 'i-tranh');
      assert.equal(resolver.mock.callCount(), 1);
      assert.deepEqual(resolver.mock.calls[0].arguments, ['SV-1']);
    });

    it('trả về null khi học sinh không có lớp đang hoạt động', async () => {
      StudentClassService.activeInstrumentResolver = async () => null;

      assert.equal(await StudentClassService.findActiveInstrumentId('SV-2'), null);
    });

    it('ném lỗi khi truy vấn thất bại (DB down)', async () => {
      StudentClassService.activeInstrumentResolver = async () => {
        throw new Error('DB down');
      };

      await assert.rejects(StudentClassService.findActiveInstrumentId('SV-1'), /DB down/);
    });
  });

  describe('useActiveInstrumentResolver', () => {
    it('thay resolver và các lần gọi sau dùng resolver mới', async () => {
      StudentClassService.useActiveInstrumentResolver(async () => 'i-bau');

      assert.equal(await StudentClassService.findActiveInstrumentId('SV-9'), 'i-bau');
    });

    it('resolver mặc định đọc từ ClassMembershipRepository', () => {
      assert.equal(originalResolver, ClassMembershipRepository.findActiveInstrumentId);
    });
  });
});
