import { test } from 'node:test';
import assert from 'node:assert/strict';
import SubmissionHistoryDTO from '../dto/SubmissionHistoryDTO.ts';
import PracticeModel from '../model/PracticeModel.ts';
import PracticeValidation from '../validation/PracticeValidation.ts';
import SubmissionHistoryService from './SubmissionHistoryService.ts';
import type PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';

const emptyFilter: Practice.HistoryFilter = { pieceIds: [], accuracyRanges: [], kinds: [] };
const baseQuery: Practice.HistoryQuery = { ...emptyFilter, page: 1, limit: 20 };

const record: Practice.HistoryRecord = {
  id: 'sub-1', pieceId: 'piece-1', sheetMusicId: 'sheet-1', assignmentId: null, status: 'COMPLETED', practiceMode: 'SOLO',
  accuracy: 88.5, createdAt: new Date('2026-10-22T03:00:00Z'), piece: { title: 'Lý ngựa ô' }, assignment: null
};

function setup(rows: Practice.HistoryRecord[] = [record], countByStatus: Partial<Record<Practice.SubmissionStatus, number>> = { COMPLETED: 1 }) {
  const calls: { filter: Practice.HistoryFilter; page: { skip: number; take: number } }[] = [];
  const repository = {
    findHistory: async (_studentId: string, filter: Practice.HistoryFilter, page: { skip: number; take: number }) => {
      calls.push({ filter, page });
      return { rows, total: rows.length };
    },
    countByStatus: async () => countByStatus,
    findSubmittedPieces: async () => [{ id: 'piece-1', title: 'Lý ngựa ô' }]
  } as unknown as PracticeSubmissionRepository;
  return { service: new SubmissionHistoryService(repository), calls };
}

test('Lịch sử trả bài nộp kèm tên bài, loại bài, phân trang và số đếm theo trạng thái', async () => {
  const { service } = setup([record], { COMPLETED: 3, PROCESSING: 1, REJECTED: 1, FAILED: 2 });
  const history = await service.list('student', baseQuery);
  assert.deepEqual(history.items[0], {
    id: 'sub-1', pieceId: 'piece-1', pieceTitle: 'Lý ngựa ô', sheetMusicId: 'sheet-1', assignmentId: null,
    status: 'COMPLETED', kind: 'PRACTICE', accuracy: 88.5, submittedAt: '2026-10-22T03:00:00.000Z'
  });
  assert.deepEqual(history.pagination, { page: 1, limit: 20, total: 1 });
  assert.deepEqual(history.overall, { total: 7, completed: 3, processing: 1, rejected: 1, failed: 2 });
});

test('Ngày lọc là ngày Việt Nam, tính cả hai đầu; trang 3 bỏ qua 40 bài', async () => {
  const { service, calls } = setup();
  await service.list('student', { ...baseQuery, fromDate: '2026-10-01', toDate: '2026-10-22', page: 3 });
  assert.equal(calls[0].filter.from?.toISOString(), '2026-09-30T17:00:00.000Z');
  assert.equal(calls[0].filter.to?.toISOString(), '2026-10-22T16:59:59.999Z');
  assert.deepEqual(calls[0].page, { skip: 40, take: 20 });
});

test('Loại bài: hòa tấu trước, rồi Bonus, bài tập lớp là Độc tấu, không gắn bài tập là Luyện tập', () => {
  assert.equal(SubmissionHistoryDTO.resolveKind({ practiceMode: 'ENSEMBLE', assignment: { type: 'BONUS' } }), 'ENSEMBLE');
  assert.equal(SubmissionHistoryDTO.resolveKind({ practiceMode: 'SOLO', assignment: { type: 'BONUS' } }), 'BONUS');
  assert.equal(SubmissionHistoryDTO.resolveKind({ practiceMode: 'SOLO', assignment: { type: 'PRACTICE' } }), 'SOLO');
  assert.equal(SubmissionHistoryDTO.resolveKind({ practiceMode: 'SOLO', assignment: null }), 'PRACTICE');
});

test('Bộ lọc: các giá trị trong một nhóm là OR, các nhóm là AND, luôn giới hạn theo học viên', () => {
  const where = PracticeModel.historyWhere('student', {
    ...emptyFilter, pieceIds: ['piece-1', 'piece-2'], accuracyRanges: ['ABOVE_90', 'BELOW_50'], kinds: ['BONUS', 'ENSEMBLE'], minAccuracy: 10, title: 'Lý Ngựa'
  });
  assert.equal(where.studentId, 'student');
  assert.deepEqual(where.AND, [
    { pieceId: { in: ['piece-1', 'piece-2'] } },
    { OR: [{ accuracy: { gt: 90 } }, { accuracy: { lt: 50 } }] },
    { accuracy: { gte: 10, lte: undefined } },
    { OR: [PracticeModel.kindWhere.BONUS, PracticeModel.kindWhere.ENSEMBLE] },
    { piece: { is: { AND: [{ titleNormalized: { contains: 'ly' } }, { titleNormalized: { contains: 'ngua' } }] } } }
  ]);
  assert.deepEqual(PracticeModel.historyWhere('student', emptyFilter), { studentId: 'student', AND: [] });
});

test('Query lịch sử: danh sách dạng "a,b", mặc định trang 1, báo lỗi khi khoảng ngày hoặc accuracy ngược', () => {
  const { historySchema } = new PracticeValidation();
  const parse = (query: Record<string, string>) => historySchema.safeParse({ body: {}, params: {}, query });

  const parsed = parse({ pieceIds: 'piece-1, piece-2', kinds: 'SOLO', minAccuracy: '70' });
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data.query.pieceIds, ['piece-1', 'piece-2']);
  assert.deepEqual(parsed.data.query.accuracyRanges, []);
  assert.equal(parsed.data.query.minAccuracy, 70);
  assert.equal(parsed.data.query.page, 1);
  assert.equal(parsed.data.query.limit, 20);

  assert.equal(parse({ fromDate: '2026-10-22', toDate: '2026-10-01' }).success, false);
  assert.equal(parse({ minAccuracy: '90', maxAccuracy: '50' }).success, false);
  assert.equal(parse({ kinds: 'EXAM' }).success, false);
  assert.equal(parse({ limit: '500' }).success, false);
});
