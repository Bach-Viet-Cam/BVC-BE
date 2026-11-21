/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records; the transaction client is a fake */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import EnvConfig from '../../../config/EnvConfig.ts';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import VerifiedRepository from '../repository/VerifiedRepository.ts';
import SubmissionReviewService from './SubmissionReviewService.ts';
import VerifiedAudioService from './VerifiedAudioService.ts';
import VerifiedContentService from './VerifiedContentService.ts';
import VerifiedPolicyService from './VerifiedPolicyService.ts';

const FORBIDDEN = 'Bạn không có quyền thực hiện thao tác này.';
const DEFAULT_NOT_FOUND = 'Không tìm thấy dữ liệu yêu cầu.';
const messages = {
  SUBMISSION_NOT_FOUND: 'Bài nộp không tồn tại.',
  CONTENT_NOT_FOUND: 'Nội dung xác minh không tồn tại.',
  DECIDED: 'Bài nộp đã có quyết định xét duyệt.',
  PROCESSING: 'Bản thu đang được phân tích. Vui lòng chờ.',
  MANUAL: 'Vui lòng xác nhận xét duyệt thủ công khi chưa có kết quả AI.',
  SHEET: 'Không xác định được bản nhạc nguồn của bài nộp.',
  FILE_GONE: 'File bản thu không còn khả dụng.',
  FILE_IN_USE: 'File đang được dùng bởi luồng phân tích khác. Vui lòng dùng bản tải lên riêng trước khi xác minh.',
  VERSION: 'Nội dung đã thay đổi. Vui lòng tải lại.',
  REVOKED: 'Nội dung đã bị thu hồi, không thể hiển thị lại.',
  REASON: 'Vui lòng nhập lý do thu hồi.',
  CANNOT_PUBLISH: 'Chưa có đồng ý chia sẻ hoặc bản nhạc nguồn không khả dụng.',
  AUDIO_UNAVAILABLE: 'Bản thu không khả dụng.',
  AUDIO_MISSING: 'File bản thu không còn tồn tại.'
};

const KEY = 'audio/123e4567-e89b-42d3-a456-426614174000.wav';
const RESOLVED_PATH = '/srv/uploads/' + KEY;

const admin = { userId: 'AD-1', role: 3, username: 'Quản trị' } as any;
const lecturer = (userId = 'GV-A') => ({ userId, role: 2, username: 'Giảng viên A' }) as any;
const student = (userId = 'SV-1') => ({ userId, role: 1, username: 'Nguyễn An' }) as any;
const sourceClass = { ownerId: 'GV-A', coLecturers: [{ lecturerId: 'GV-C' }] };

function createMockSubmission(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'sub-1',
    studentId: 'SV-1',
    status: 'COMPLETED',
    shareConsent: true,
    fileDeletedAt: null,
    fileUrl: null,
    pieceId: 'p1',
    accuracy: 85,
    tempoDeviation: 3,
    review: null,
    verifiedContent: null,
    assignment: { classId: 'c1', class: { ownerId: 'GV-A', coLecturers: [], name: 'DTR101.M1', cohort: 'K18' } },
    assignmentVersion: { sheetMusicId: 's1' },
    sheetMusic: {
      id: 's1',
      pieceId: 'p1',
      instrumentId: 'i-tranh',
      visibility: 'PUBLIC',
      moderation: 'NORMAL',
      piece: { visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null },
      instrument: { isActive: true }
    },
    studentUpload: { id: 'up-1', key: KEY, provider: 'local', deletingAt: null, contentType: 'audio/wav' },
    ...overrides
  };
}

function createMockContent(overrides: Record<string, unknown> = {}, submission: Record<string, unknown> = {}): any {
  return {
    id: 'vc-1',
    submissionId: 'sub-1',
    pieceId: 'p1',
    piece: { title: 'Lý ngựa ô', visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null },
    sourceSheetMusicId: 's1',
    sourceSheetMusic: { visibility: 'PUBLIC', moderation: 'NORMAL' },
    instrumentId: 'i-tranh',
    instrument: { name: 'Đàn tranh', isActive: true },
    submission: { studentId: 'SV-1', shareConsent: true, fileDeletedAt: null, student: { username: 'Nguyễn An' }, ...submission },
    cohort: 'K18',
    sourceClassName: 'DTR101.M1',
    sourceClass: { ownerId: 'GV-A', coLecturers: [] },
    accuracy: 85,
    tempoDeviation: 3,
    verifiedByName: 'Giảng viên A',
    verifiedAt: new Date('2026-11-05T03:00:00Z'),
    status: 'VISIBLE',
    version: 1,
    reason: 'Bản thu mẫu tốt',
    audioUpload: { key: KEY, provider: 'local', deletingAt: null, contentType: 'audio/wav' },
    ...overrides
  };
}

// Transaction client giả: ghi lại các lệnh ghi theo thứ tự [tên, tham số]
function createFakeTx(counts: { processing: number; evaluations: number }) {
  const writes: [string, any][] = [];
  const record = (name: string) => async (args: any) => {
    writes.push([name, args]);
    return {};
  };
  const tx = {
    submission: { update: record('submission.update'), count: async () => counts.processing },
    audioEvaluationRequest: { count: async () => counts.evaluations },
    verifiedContent: { updateMany: record('verifiedContent.updateMany'), create: record('verifiedContent.create'), update: record('verifiedContent.update') },
    submissionReview: { create: record('submissionReview.create') },
    auditLog: { create: record('auditLog.create') }
  };
  return { tx, writes };
}

function findWrite(writes: [string, any][], name: string): any {
  return writes.find(([writeName]) => writeName === name)?.[1];
}

// Bài nộp đọc qua VerifiedRepository.source; đổi state.row / state.counts để thử nhiều biến thể trong cùng test
function mockSubmissionSource(row: any) {
  const state = { row, counts: { processing: 0, evaluations: 0 } };
  const { tx, writes } = createFakeTx(state.counts);
  mock.method(VerifiedRepository, 'locked', async (work: (client: any) => Promise<unknown>) => work(tx) as any);
  mock.method(VerifiedRepository, 'source', async () => state.row);
  const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => 1 as any);
  const resolveMock = mock.method(VerifiedAudioService, 'resolve', async () => RESOLVED_PATH);
  return { state, writes, notifyMock, resolveMock };
}

// Nội dung xác minh đọc qua VerifiedRepository.find
function mockVerifiedContent(row: any) {
  const { tx, writes } = createFakeTx({ processing: 0, evaluations: 0 });
  mock.method(VerifiedRepository, 'locked', async (work: (client: any) => Promise<unknown>) => work(tx) as any);
  mock.method(VerifiedRepository, 'find', async () => row);
  const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => 1 as any);
  const resolveMock = mock.method(VerifiedAudioService, 'resolve', async () => RESOLVED_PATH);
  return { writes, notifyMock, resolveMock };
}

function isAppError(statusCode: number, message: string) {
  return (err: unknown) => err instanceof AppError && err.statusCode === statusCode && err.message === message;
}

const env = EnvConfig as any;
const originalStorageRoot = env.fileStorageLocalRoot;
const originalPrismaInstance = PrismaClientProvider.instance;

async function withStorageRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bvc-verified-'));
  try {
    await mkdir(path.join(root, 'audio'));
    env.fileStorageLocalRoot = root;
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('VerifiedContentService (Bản thu xác minh trong cộng đồng)', () => {
  afterEach(() => {
    env.fileStorageLocalRoot = originalStorageRoot;
    (PrismaClientProvider as any).instance = originalPrismaInstance;
    mock.restoreAll();
  });

  describe('VerifiedPolicyService.canManage / canPublish', () => {
    it('admin được quản lý nội dung của mọi lớp', () => {
      assert.equal(VerifiedPolicyService.canManage(admin, sourceClass), true);
    });

    it('giảng viên chủ lớp được quản lý', () => {
      assert.equal(VerifiedPolicyService.canManage(lecturer(), sourceClass), true);
    });

    it('giảng viên đồng giảng dạy được quản lý', () => {
      assert.equal(VerifiedPolicyService.canManage(lecturer('GV-C'), sourceClass), true);
    });

    it('giảng viên không thuộc lớp KHÔNG được quản lý', () => {
      assert.equal(VerifiedPolicyService.canManage(lecturer('GV-B'), sourceClass), false);
    });

    it('học sinh KHÔNG được quản lý', () => {
      assert.equal(VerifiedPolicyService.canManage(student(), sourceClass), false);
    });

    it('được công khai khi có đồng ý chia sẻ, bài và bản nhạc công khai, nhạc cụ đang hoạt động', () => {
      assert.equal(VerifiedPolicyService.canPublish(createMockContent()), true);
    });

    it('KHÔNG được công khai khi bị thu hồi, rút đồng ý, xóa file, bài bị ẩn, bản nhạc bị admin ẩn, nhạc cụ ngưng hoặc audio đang xóa', () => {
      const variants = [
        createMockContent({ status: 'REVOKED' }),
        createMockContent({}, { shareConsent: false }),
        createMockContent({}, { fileDeletedAt: new Date() }),
        createMockContent({ piece: { title: 'x', visibility: 'HIDDEN', moderation: 'NORMAL', deletedAt: null } }),
        createMockContent({ sourceSheetMusic: { visibility: 'PUBLIC', moderation: 'ADMIN_HIDDEN' } }),
        createMockContent({ instrument: { name: 'Đàn tranh', isActive: false } }),
        createMockContent({ audioUpload: { key: KEY, provider: 'local', deletingAt: new Date(), contentType: 'audio/wav' } })
      ];

      for (const row of variants) {
        assert.equal(VerifiedPolicyService.canPublish(row), false);
      }
    });
  });

  describe('VerifiedAudioService.resolve / legacy', () => {
    it('trả về đường dẫn tuyệt đối của file nằm trong thư mục lưu trữ', async () => {
      await withStorageRoot(async (root) => {
        await writeFile(path.join(root, KEY), 'RIFF0000WAVE');

        const result = await VerifiedAudioService.resolve(KEY, 'local');

        assert.equal(result, path.join(await realpath(root), KEY));
      });
    });

    it('báo lỗi 404 khi provider không phải local, có path traversal hoặc sai phần mở rộng', async () => {
      const invalidInputs: [string, string][] = [
        [KEY, 's3'],
        ['audio/../../etc/passwd.wav', 'local'],
        ['audio/abc.ogg', 'local']
      ];

      for (const [key, provider] of invalidInputs) {
        await assert.rejects(VerifiedAudioService.resolve(key, provider), isAppError(404, messages.AUDIO_UNAVAILABLE));
      }
    });

    it('báo lỗi 404 khi file không còn tồn tại trong thư mục lưu trữ', async () => {
      await withStorageRoot(async () => {
        await assert.rejects(VerifiedAudioService.resolve(KEY, 'local'), isAppError(404, messages.AUDIO_MISSING));
      });
    });

    it('đọc bản thu cũ qua URL /uploads và suy ra contentType audio/wav', async () => {
      await withStorageRoot(async (root) => {
        await writeFile(path.join(root, KEY), 'x');

        const result = await VerifiedAudioService.legacy(`http://localhost:3000/uploads/${KEY}`);

        assert.equal(result.contentType, 'audio/wav');
      });
    });
  });

  describe('SubmissionReviewService.assertRead / get', () => {
    it('admin, học sinh chủ bài và giảng viên của lớp đều được xem bài nộp', () => {
      for (const actor of [admin, student(), lecturer()]) {
        assert.doesNotThrow(() => SubmissionReviewService.assertRead(actor, createMockSubmission()));
      }
    });

    it('báo lỗi 403 khi học sinh khác hoặc giảng viên không thuộc lớp xem bài nộp', () => {
      for (const actor of [student('SV-2'), lecturer('GV-B')]) {
        assert.throws(() => SubmissionReviewService.assertRead(actor, createMockSubmission()), isAppError(403, FORBIDDEN));
      }
    });

    it('giảng viên của lớp được xét duyệt bài nộp đã hoàn thành chưa có kết quả', async () => {
      mock.method(VerifiedRepository, 'source', async () => createMockSubmission());

      const result = await SubmissionReviewService.get(lecturer(), 'sub-1');

      assert.deepEqual(result, { review: null, shareConsent: true, canReview: true, verifiedContentId: null });
    });

    it('giá trị biên: học sinh xem bài của mình thì canReview = false', async () => {
      mock.method(VerifiedRepository, 'source', async () => createMockSubmission());

      const result = await SubmissionReviewService.get(student(), 'sub-1');

      assert.equal(result.canReview, false);
    });

    it('báo lỗi 404 khi bài nộp không tồn tại', async () => {
      mock.method(VerifiedRepository, 'source', async () => null);

      await assert.rejects(SubmissionReviewService.get(lecturer(), 'sub-x'), isAppError(404, messages.SUBMISSION_NOT_FOUND));
    });
  });

  describe('SubmissionReviewService.consent', () => {
    it('học sinh đồng ý chia sẻ: cập nhật shareConsent và ghi audit SHARING_GRANTED', async () => {
      const { writes } = mockSubmissionSource(createMockSubmission({ shareConsent: false }));

      await SubmissionReviewService.consent(student(), 'sub-1', true);

      assert.deepEqual(writes.map(([name]) => name), ['submission.update', 'auditLog.create']);
      assert.equal(writes[1][1].data.action, 'SHARING_GRANTED');
    });

    it('báo lỗi 403 khi người khác (học sinh khác hoặc giảng viên) thay đổi đồng ý chia sẻ', async () => {
      mockSubmissionSource(createMockSubmission());

      for (const actor of [student('SV-2'), lecturer()]) {
        await assert.rejects(SubmissionReviewService.consent(actor, 'sub-1', true), isAppError(403, FORBIDDEN));
      }
    });
  });

  describe('SubmissionReviewService.decide', () => {
    it('duyệt bài: tạo nội dung xác minh VISIBLE, ghi review APPROVED và thông báo cho học sinh', async () => {
      const { writes, notifyMock, resolveMock } = mockSubmissionSource(createMockSubmission());

      await SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE' } as any);

      const created = findWrite(writes, 'verifiedContent.create').data;
      assert.equal(created.status, 'VISIBLE');
      assert.equal(created.sourceClassName, 'DTR101.M1');
      assert.equal(created.cohort, 'K18');
      assert.equal(created.accuracy, 85);
      assert.equal(created.audioUploadId, 'up-1');
      assert.equal(created.verifiedByName, 'Giảng viên A');
      assert.equal(findWrite(writes, 'submissionReview.create').data.status, 'APPROVED');
      assert.deepEqual(notifyMock.mock.calls[0].arguments[1], ['SV-1']);
      assert.equal((notifyMock.mock.calls[0].arguments[2] as any).title, 'Bản thu đã được xác minh');
      assert.equal(resolveMock.mock.calls[0].arguments[0], KEY);
    });

    it('giá trị biên: duyệt bài chưa có đồng ý chia sẻ thì nội dung ở trạng thái HIDDEN', async () => {
      const { writes, notifyMock } = mockSubmissionSource(createMockSubmission({ shareConsent: false }));

      await SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE' } as any);

      assert.equal(findWrite(writes, 'verifiedContent.create').data.status, 'HIDDEN');
      assert.equal((notifyMock.mock.calls[0].arguments[2] as any).body, 'Giảng viên đã xác minh. Bản thu chưa được chia sẻ vì bạn chưa đồng ý.');
    });

    it('từ chối bài: KHÔNG tạo nội dung xác minh, ghi lý do và thông báo cho học sinh', async () => {
      const { writes, notifyMock } = mockSubmissionSource(createMockSubmission());

      await SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'REJECT', reason: 'Thu âm bị rè' } as any);

      const notification = notifyMock.mock.calls[0].arguments[2] as any;
      assert.equal(findWrite(writes, 'verifiedContent.create'), undefined);
      assert.equal(findWrite(writes, 'submissionReview.create').data.reason, 'Thu âm bị rè');
      assert.equal(notification.title, 'Bản thu chưa được duyệt');
      assert.equal(notification.body, 'Thu âm bị rè');
    });

    it('giá trị biên: bài FAILED (chưa có kết quả AI) cần xác nhận duyệt thủ công', async () => {
      const { writes } = mockSubmissionSource(createMockSubmission({ status: 'FAILED' }));

      await assert.rejects(SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE' } as any), isAppError(409, messages.MANUAL));

      await SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE', manual: true } as any);
      assert.ok(findWrite(writes, 'verifiedContent.create'));
    });

    it('giá trị biên: bài đã APPROVED thì duyệt lại không ghi gì, còn từ chối thì báo lỗi 409', async () => {
      const { writes } = mockSubmissionSource(createMockSubmission({ review: { status: 'APPROVED' } }));

      await SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE' } as any);
      assert.equal(writes.length, 0);

      await assert.rejects(
        SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'REJECT', reason: 'x' } as any),
        isAppError(409, messages.DECIDED)
      );
    });

    it('báo lỗi 409 khi bản thu đang được phân tích (PROCESSING)', async () => {
      mockSubmissionSource(createMockSubmission({ status: 'PROCESSING' }));

      await assert.rejects(
        SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'REJECT', reason: 'x' } as any),
        isAppError(409, messages.PROCESSING)
      );
    });

    it('báo lỗi 409 khi phiên bản bài tập trỏ tới bản nhạc khác với bản nhạc của bài nộp', async () => {
      mockSubmissionSource(createMockSubmission({ assignmentVersion: { sheetMusicId: 's2' } }));

      await assert.rejects(SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE' } as any), isAppError(409, messages.SHEET));
    });

    it('báo lỗi 409 khi file bản thu đã xóa, không có upload hoặc upload đang bị xóa', async () => {
      const { state } = mockSubmissionSource(createMockSubmission());
      const variants = [
        createMockSubmission({ fileDeletedAt: new Date() }),
        createMockSubmission({ studentUpload: null }),
        createMockSubmission({ studentUpload: { id: 'up-1', key: KEY, provider: 'local', deletingAt: new Date() } })
      ];

      for (const row of variants) {
        state.row = row;
        await assert.rejects(SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE' } as any), isAppError(409, messages.FILE_GONE));
      }
    });

    it('báo lỗi 409 khi upload đang được bài nộp PROCESSING khác hoặc yêu cầu chấm audio sử dụng', async () => {
      const { state } = mockSubmissionSource(createMockSubmission());

      for (const counts of [{ processing: 1, evaluations: 0 }, { processing: 0, evaluations: 1 }]) {
        Object.assign(state.counts, counts);
        await assert.rejects(SubmissionReviewService.decide(lecturer(), 'sub-1', { decision: 'APPROVE' } as any), isAppError(409, messages.FILE_IN_USE));
      }
    });

    it('báo lỗi 403 khi giảng viên không thuộc lớp hoặc admin xét duyệt', async () => {
      mockSubmissionSource(createMockSubmission());

      for (const actor of [lecturer('GV-B'), admin]) {
        await assert.rejects(SubmissionReviewService.decide(actor, 'sub-1', { decision: 'APPROVE' } as any), isAppError(403, FORBIDDEN));
      }
    });
  });

  describe('VerifiedContentService.list', () => {
    it('lọc theo trạng thái, nhạc cụ, khóa, từ khóa và sắp xếp theo độ chính xác', async () => {
      const listMock = mock.method(VerifiedRepository, 'list', async () => ({
        items: [createMockContent({ status: 'HIDDEN' })],
        total: 1,
        page: 1,
        pageSize: 20
      }));

      const result = await VerifiedContentService.list(lecturer(), {
        status: 'HIDDEN', instrumentId: 'i-tranh', cohort: 'K18', q: 'an', sortBy: 'accuracy', sortDir: 'desc', page: 1, pageSize: 20
      } as any);

      const [where, page, pageSize, orderBy] = listMock.mock.calls[0].arguments as any[];
      assert.equal(result.total, 1);
      assert.equal(where.status, 'HIDDEN');
      assert.equal(where.instrumentId, 'i-tranh');
      assert.equal(where.cohort, 'K18');
      assert.equal(where.OR.length, 2);
      assert.equal(page, 1);
      assert.equal(pageSize, 20);
      assert.deepEqual(orderBy, { accuracy: { sort: 'desc', nulls: 'last' } });
    });

    it('giá trị biên: status ALL không lọc trạng thái; có pieceId thì dùng bộ lọc công khai', async () => {
      const listMock = mock.method(VerifiedRepository, 'list', async () => ({ items: [], total: 0, page: 1, pageSize: 20 }));
      const query = { status: 'ALL', sortBy: 'verifiedAt', sortDir: 'asc', page: 1, pageSize: 20 } as any;

      await VerifiedContentService.list(admin, query);
      await VerifiedContentService.list(student(), query, 'p1');

      const [adminWhere, , , adminOrderBy] = listMock.mock.calls[0].arguments as any[];
      const [studentWhere] = listMock.mock.calls[1].arguments as any[];
      assert.deepEqual(adminWhere, {});
      assert.deepEqual(adminOrderBy, { verifiedAt: 'asc' });
      assert.equal(studentWhere.pieceId, 'p1');
    });
  });

  describe('VerifiedContentService.get', () => {
    it('trả về nội dung kèm quyền thao tác cho giảng viên quản lý', async () => {
      mock.method(VerifiedRepository, 'find', async () => createMockContent());

      const item = await VerifiedContentService.get(lecturer(), 'vc-1');

      assert.equal(item.pieceTitle, 'Lý ngựa ô');
      assert.equal(item.performerDisplayName, 'Nguyễn An');
      assert.equal(item.reason, 'Bản thu mẫu tốt');
      assert.equal(item.canHide, true);
      assert.equal(item.canShow, false);
      assert.equal(item.canRevoke, true);
    });

    it('báo lỗi 404 khi học sinh xem nội dung đang bị ẩn', async () => {
      mock.method(VerifiedRepository, 'find', async () => createMockContent({ status: 'HIDDEN' }));

      await assert.rejects(VerifiedContentService.get(student(), 'vc-1'), isAppError(404, DEFAULT_NOT_FOUND));
    });

    it('báo lỗi 404 khi nội dung xác minh không tồn tại', async () => {
      mock.method(VerifiedRepository, 'find', async () => null);

      await assert.rejects(VerifiedContentService.get(lecturer(), 'vc-x'), isAppError(404, messages.CONTENT_NOT_FOUND));
    });
  });

  describe('VerifiedContentService.mutate', () => {
    it('ẩn nội dung: tăng version, ghi audit VERIFIED_HIDDEN và thông báo cho học sinh', async () => {
      const { writes, notifyMock } = mockVerifiedContent(createMockContent());

      await VerifiedContentService.mutate(lecturer(), 'vc-1', { status: 'HIDDEN', version: 1, reason: 'Tạm ẩn' } as any, false);

      const notification = notifyMock.mock.calls[0].arguments[2] as any;
      assert.equal(writes[0][1].data.status, 'HIDDEN');
      assert.deepEqual(writes[0][1].data.version, { increment: 1 });
      assert.equal(writes[1][1].data.action, 'VERIFIED_HIDDEN');
      assert.equal(notification.title, 'Bản thu tham khảo đã được ẩn');
      assert.equal(notification.body, 'Tạm ẩn');
    });

    it('hiện lại nội dung: kiểm tra file audio và KHÔNG gửi thông báo', async () => {
      const { writes, notifyMock, resolveMock } = mockVerifiedContent(createMockContent({ status: 'HIDDEN' }));

      await VerifiedContentService.mutate(lecturer(), 'vc-1', { status: 'VISIBLE', version: 1 } as any, false);

      assert.equal(writes[0][1].data.status, 'VISIBLE');
      assert.equal(notifyMock.mock.callCount(), 0);
      assert.equal(resolveMock.mock.callCount(), 1);
    });

    it('admin thu hồi nội dung: trạng thái REVOKED và thông báo thu hồi', async () => {
      const { writes, notifyMock } = mockVerifiedContent(createMockContent());

      await VerifiedContentService.mutate(admin, 'vc-1', { version: 1, reason: 'Vi phạm bản quyền' } as any, true);

      assert.equal(writes[0][1].data.status, 'REVOKED');
      assert.equal((notifyMock.mock.calls[0].arguments[2] as any).title, 'Xác minh bản thu đã được thu hồi');
    });

    it('báo lỗi 409 khi version đã cũ', async () => {
      mockVerifiedContent(createMockContent({ version: 2 }));

      await assert.rejects(
        VerifiedContentService.mutate(lecturer(), 'vc-1', { status: 'HIDDEN', version: 1 } as any, false),
        isAppError(409, messages.VERSION)
      );
    });

    it('báo lỗi 409 khi hiện lại nội dung đã bị thu hồi', async () => {
      mockVerifiedContent(createMockContent({ status: 'REVOKED' }));

      await assert.rejects(
        VerifiedContentService.mutate(lecturer(), 'vc-1', { status: 'VISIBLE', version: 1 } as any, false),
        isAppError(409, messages.REVOKED)
      );
    });

    it('báo lỗi 400 khi thu hồi mà không có lý do', async () => {
      mockVerifiedContent(createMockContent());

      await assert.rejects(VerifiedContentService.mutate(lecturer(), 'vc-1', { version: 1 } as any, true), isAppError(400, messages.REASON));
    });

    it('báo lỗi 409 khi hiện lại nội dung mà học sinh đã rút đồng ý chia sẻ', async () => {
      mockVerifiedContent(createMockContent({ status: 'HIDDEN' }, { shareConsent: false }));

      await assert.rejects(
        VerifiedContentService.mutate(lecturer(), 'vc-1', { status: 'VISIBLE', version: 1 } as any, false),
        isAppError(409, messages.CANNOT_PUBLISH)
      );
    });

    it('báo lỗi 403 khi giảng viên không thuộc lớp nguồn thao tác', async () => {
      mockVerifiedContent(createMockContent());

      await assert.rejects(
        VerifiedContentService.mutate(lecturer('GV-B'), 'vc-1', { status: 'HIDDEN', version: 1 } as any, false),
        isAppError(403, FORBIDDEN)
      );
    });
  });

  describe('VerifiedContentService.audio', () => {
    it('học sinh bất kỳ nghe được nội dung đang công khai', async () => {
      mockVerifiedContent(createMockContent());

      const result = await VerifiedContentService.audio(student('SV-2'), 'vc-1', false);

      assert.deepEqual(result, { path: RESOLVED_PATH, contentType: 'audio/wav' });
    });

    it('giá trị biên: nội dung bị ẩn chỉ giảng viên và học sinh biểu diễn nghe được', async () => {
      mockVerifiedContent(createMockContent({ status: 'HIDDEN' }));

      await assert.rejects(VerifiedContentService.audio(student('SV-2'), 'vc-1', false), isAppError(404, DEFAULT_NOT_FOUND));
      assert.equal((await VerifiedContentService.audio(lecturer('GV-B'), 'vc-1', false)).contentType, 'audio/wav');
      assert.equal((await VerifiedContentService.audio(student(), 'vc-1', false)).contentType, 'audio/wav');
    });

    it('báo lỗi 404 khi file bài nộp đã xóa hoặc không có upload lẫn fileUrl', async () => {
      const { state } = mockSubmissionSource(createMockSubmission());

      for (const row of [createMockSubmission({ fileDeletedAt: new Date() }), createMockSubmission({ studentUpload: null, fileUrl: null })]) {
        state.row = row;
        await assert.rejects(VerifiedContentService.audio(lecturer(), 'sub-1', true), isAppError(404, messages.AUDIO_UNAVAILABLE));
      }
    });

    it('báo lỗi 403 khi học sinh khác nghe bài nộp', async () => {
      mockSubmissionSource(createMockSubmission());

      await assert.rejects(VerifiedContentService.audio(student('SV-2'), 'sub-1', true), isAppError(403, FORBIDDEN));
    });
  });

  describe('VerifiedContentService.isProtectedKey', () => {
    it('trả về true khi key thuộc nội dung đã xác minh và false khi không (dọn storage phải giữ lại audio đã xác minh)', async () => {
      let count = 1;
      (PrismaClientProvider as any).instance = { verifiedContent: { count: async () => count } };

      const isProtectedFirst = await VerifiedContentService.isProtectedKey(KEY);
      count = 0;
      const isProtectedSecond = await VerifiedContentService.isProtectedKey(KEY);

      assert.equal(isProtectedFirst, true);
      assert.equal(isProtectedSecond, false);
    });
  });
});
