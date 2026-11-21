/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records; private members are reached through a loose handle */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import EnvConfig from '../../../config/EnvConfig.ts';
import NotificationService from '../../../lib/NotificationService.ts';
import AppError from '../../../utils/AppError.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import AnalysisService from './AnalysisService.ts';
import TemplateAnalysisPublisherService from './TemplateAnalysisPublisherService.ts';

// schedulePoll, poll, resumePending, resumeTimer là private
const analysisService = AnalysisService as any;
const publisher = TemplateAnalysisPublisherService.instance;
const RHYTHM_BASE_URL = EnvConfig.rhythmServiceBaseUrl;
const DISPATCH_FAILED = 'Không gửi được yêu cầu phân tích tới dịch vụ AI.';
const SHEET_NOT_FOUND = 'Không thể tìm bản nhạc vì bản nhạc không tồn tại.';

function createMockTarget(overrides: Record<string, unknown> = {}): any {
  return {
    id: 's1',
    kind: 'MAIN',
    referenceAudio: { id: 'a1', storageKey: 'audio/2026-11/a1.wav', status: 'READY' },
    instrument: { code: 'DBA103', name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 },
    ...overrides
  };
}

function createMockSheetForAnalysis(overrides: Record<string, unknown> = {}): any {
  return {
    id: 's1',
    kind: 'MAIN',
    name: 'Bản chính',
    analysisJobId: 'job-1',
    referenceAudio: { id: 'a1' },
    instrument: { code: 'DBA103' },
    piece: { id: 'p1', ownerId: 'GV-A', title: 'Lý ngựa ô' },
    ...overrides
  };
}

function createRhythmMetadata(overrides: Record<string, unknown> = {}) {
  return {
    analysisId: 'job-1',
    sheetMusicId: 's1',
    mediaFileId: 'a1',
    instrumentCode: 'dan_bau',
    status: 'completed',
    artifactUrl: '/artifacts/job-1.json',
    error: null,
    ...overrides
  };
}

function createArtifact(overrides: Record<string, unknown> = {}) {
  return { analysisId: 'job-1', sheetMusicId: 's1', mediaFileId: 'a1', ...overrides };
}

function jsonResponse(status: number, body: unknown = {}): any {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Mock các thao tác sau khi poll/callback: đọc sheet, cập nhật theo job, gửi thông báo, hẹn giờ poll lại
function mockAnalysisFlow(sheetRecord: unknown = createMockSheetForAnalysis(), isApplied = true) {
  return {
    schedulePollMock: mock.method(analysisService, 'schedulePoll', () => {}),
    findMock: mock.method(SheetMusicRepository, 'findForAnalysis', async () => sheetRecord as any),
    updateIfJobMatchesMock: mock.method(SheetMusicRepository, 'updateIfJobMatches', async () => isApplied),
    notifyMock: mock.method(NotificationService, 'notifyUser', async () => undefined as any)
  };
}

// Lần lượt trả về từng response cho mỗi lần gọi fetch; Error thì ném ra
function mockFetchResponses(...responses: any[]) {
  return mock.method(globalThis, 'fetch', async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
}

function mockRequestFlow(publication = 'published') {
  return {
    updateMock: mock.method(SheetMusicRepository, 'update', async () => ({}) as any),
    updateIfJobMatchesMock: mock.method(SheetMusicRepository, 'updateIfJobMatches', async () => true),
    publishMock: mock.method(publisher, 'publish', async () => publication as any),
    schedulePollMock: mock.method(analysisService, 'schedulePoll', () => {})
  };
}

describe('AnalysisService (Phân tích bản thu mẫu qua Rhythm)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('requestAnalysis', () => {
    it('bỏ qua bản nhạc LEVEL: không cập nhật và không gửi job', async () => {
      const { updateMock, publishMock } = mockRequestFlow();

      await AnalysisService.requestAnalysis(createMockTarget({ kind: 'LEVEL' }));

      assert.equal(updateMock.mock.callCount(), 0);
      assert.equal(publishMock.mock.callCount(), 0);
    });

    it('bỏ qua khi chưa có bản thu mẫu (referenceAudio = null)', async () => {
      const { updateMock, publishMock } = mockRequestFlow();

      await AnalysisService.requestAnalysis(createMockTarget({ referenceAudio: null }));

      assert.equal(updateMock.mock.callCount(), 0);
      assert.equal(publishMock.mock.callCount(), 0);
    });

    it('gửi job thành công: chuyển sheet sang PROCESSING và hẹn giờ poll kết quả', async () => {
      const { updateMock, publishMock, schedulePollMock } = mockRequestFlow();

      await AnalysisService.requestAnalysis(createMockTarget());

      const job = publishMock.mock.calls[0].arguments[0] as any;
      assert.equal(publishMock.mock.callCount(), 1);
      assert.deepEqual(updateMock.mock.calls[0].arguments[1], {
        analysisJobId: job.analysisId,
        analysisStatus: 'PROCESSING',
        analysisFileUrl: null,
        analysisError: null,
        timeSignatureMissing: false
      });
      assert.deepEqual(schedulePollMock.mock.calls[0].arguments, ['s1', job.analysisId]);
    });

    it('job chứa đúng sheetMusicId, mediaFileId, mediaUrl, mã nhạc cụ Rhythm và thông số nhạc cụ', async () => {
      const { publishMock } = mockRequestFlow();

      await AnalysisService.requestAnalysis(createMockTarget());

      const job = publishMock.mock.calls[0].arguments[0] as any;
      assert.equal(job.sheetMusicId, 's1');
      assert.equal(job.mediaFileId, 'a1');
      assert.equal(job.instrumentCode, 'dan_bau');
      assert.deepEqual(job.instrument, { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 });
      assert.match(job.mediaUrl, /audio\/2026-11\/a1\.wav$/);
      assert.match(job.messageId, /^[0-9a-f-]{36}$/);
      assert.ok(!Number.isNaN(Date.parse(job.requestedAt)));
    });

    it('ánh xạ mã nhạc cụ DTR / DNG / TY_BA sang mã của Rhythm', async () => {
      const { publishMock } = mockRequestFlow();

      for (const code of ['DTR', 'DNG', 'TY_BA']) {
        await AnalysisService.requestAnalysis(createMockTarget({ instrument: { ...createMockTarget().instrument, code } }));
      }

      const instrumentCodes = publishMock.mock.calls.map((call) => (call.arguments[0] as any).instrumentCode);
      assert.deepEqual(instrumentCodes, ['dan_tranh', 'dan_nguyet', 'dan_ty_ba']);
    });

    it('gửi job thất bại (publish_failed): ghi trạng thái ERROR và KHÔNG hẹn giờ poll', async () => {
      const { publishMock, updateIfJobMatchesMock, schedulePollMock } = mockRequestFlow('publish_failed');

      await AnalysisService.requestAnalysis(createMockTarget());

      const job = publishMock.mock.calls[0].arguments[0] as any;
      const [sheetMusicId, analysisId, data] = updateIfJobMatchesMock.mock.calls[0].arguments as any[];
      assert.equal(sheetMusicId, 's1');
      assert.equal(analysisId, job.analysisId);
      assert.deepEqual(data, { analysisStatus: 'ERROR', analysisError: DISPATCH_FAILED });
      assert.equal(schedulePollMock.mock.callCount(), 0);
    });

    it('giá trị biên: publish_unknown được coi là đã gửi, vẫn hẹn giờ poll và không ghi ERROR', async () => {
      const { updateIfJobMatchesMock, schedulePollMock } = mockRequestFlow('publish_unknown');

      await AnalysisService.requestAnalysis(createMockTarget());

      assert.equal(updateIfJobMatchesMock.mock.callCount(), 0);
      assert.equal(schedulePollMock.mock.callCount(), 1);
    });

    it('ném lỗi khi cập nhật sheet thất bại (DB down) và KHÔNG gửi job', async () => {
      const publishMock = mock.method(publisher, 'publish', async () => 'published' as any);
      mock.method(SheetMusicRepository, 'update', async () => {
        throw new Error('DB down');
      });

      await assert.rejects(AnalysisService.requestAnalysis(createMockTarget()), /DB down/);
      assert.equal(publishMock.mock.callCount(), 0);
    });
  });

  describe('clearAnalysis', () => {
    it('xóa toàn bộ trạng thái phân tích của sheet', async () => {
      const updateMock = mock.method(SheetMusicRepository, 'update', async () => ({}) as any);

      await AnalysisService.clearAnalysis('s1');

      assert.equal(updateMock.mock.callCount(), 1);
      assert.deepEqual(updateMock.mock.calls[0].arguments, [
        's1',
        { analysisJobId: null, analysisStatus: 'NONE', analysisFileUrl: null, analysisError: null, timeSignatureMissing: false }
      ]);
    });
  });

  describe('handleCallback', () => {
    it('báo lỗi 404 MSG-08 khi bản nhạc không tồn tại', async () => {
      mock.method(SheetMusicRepository, 'findForAnalysis', async () => null);

      await assert.rejects(
        AnalysisService.handleCallback('s-x', { status: 'READY' } as any),
        (err: unknown) => err instanceof AppError && err.statusCode === 404 && err.code === 'MSG-08' && err.message === SHEET_NOT_FOUND
      );
    });

    it('bỏ qua callback của job cũ: không cập nhật và không thông báo', async () => {
      const { updateIfJobMatchesMock, notifyMock } = mockAnalysisFlow();

      const result = await AnalysisService.handleCallback('s1', { jobId: 'job-OLD', status: 'READY' } as any);

      assert.deepEqual(result, { isApplied: false });
      assert.equal(updateIfJobMatchesMock.mock.callCount(), 0);
      assert.equal(notifyMock.mock.callCount(), 0);
    });

    it('callback READY: lưu file phân tích và thông báo cho chủ bài hát', async () => {
      const { updateIfJobMatchesMock, notifyMock } = mockAnalysisFlow();

      const result = await AnalysisService.handleCallback('s1', { status: 'READY', analysisFileUrl: 'http://x/a.json' } as any);

      const [ownerId, notification] = notifyMock.mock.calls[0].arguments as any[];
      assert.deepEqual(result, { isApplied: true });
      assert.deepEqual(updateIfJobMatchesMock.mock.calls[0].arguments, [
        's1',
        'job-1',
        { analysisStatus: 'READY', analysisFileUrl: 'http://x/a.json', analysisError: null, timeSignatureMissing: false }
      ]);
      assert.equal(ownerId, 'GV-A');
      assert.equal(notification.title, 'Bản thu mẫu đã phân tích xong');
      assert.equal(notification.body, 'Lý ngựa ô · Bản chính');
      assert.equal(notification.link, '/giang-vien/bai-hat/p1/ban-nhac');
    });

    it('callback ERROR: lưu lý do lỗi và thông báo phân tích thất bại', async () => {
      const { updateIfJobMatchesMock, notifyMock } = mockAnalysisFlow();

      const result = await AnalysisService.handleCallback('s1', { status: 'ERROR', reason: 'Âm thanh quá nhỏ' } as any);

      const notification = notifyMock.mock.calls[0].arguments[1] as any;
      assert.deepEqual(result, { isApplied: true });
      assert.deepEqual(updateIfJobMatchesMock.mock.calls[0].arguments[2], { analysisStatus: 'ERROR', analysisError: 'Âm thanh quá nhỏ' });
      assert.equal(notification.title, 'Phân tích bản thu mẫu thất bại');
      assert.equal(notification.body, 'Lý ngựa ô · Bản chính: Âm thanh quá nhỏ');
    });

    it('giá trị biên: callback ERROR không có lý do thì ghi "Không rõ lý do."', async () => {
      const { updateIfJobMatchesMock } = mockAnalysisFlow();

      await AnalysisService.handleCallback('s1', { status: 'ERROR' } as any);

      assert.equal((updateIfJobMatchesMock.mock.calls[0].arguments[2] as any).analysisError, 'Không rõ lý do.');
    });

    it('KHÔNG thông báo khi job đã bị job khác thay thế (updateIfJobMatches = false)', async () => {
      const { notifyMock } = mockAnalysisFlow(createMockSheetForAnalysis(), false);

      const result = await AnalysisService.handleCallback('s1', { status: 'READY', analysisFileUrl: 'u' } as any);

      assert.deepEqual(result, { isApplied: false });
      assert.equal(notifyMock.mock.callCount(), 0);
    });
  });

  describe('poll (kiểm tra trạng thái job trên Rhythm)', () => {
    it('lỗi mạng: hẹn giờ poll lại và KHÔNG ghi DB', async () => {
      const { schedulePollMock, updateIfJobMatchesMock } = mockAnalysisFlow();
      const fetchMock = mockFetchResponses(new Error('ECONNREFUSED'));

      await analysisService.poll('s1', 'job-1');

      assert.deepEqual(fetchMock.mock.calls.map((call) => call.arguments[0]), [`${RHYTHM_BASE_URL}/api/v1/template-analyses/job-1`]);
      assert.deepEqual(schedulePollMock.mock.calls.map((call: any) => call.arguments), [['s1', 'job-1']]);
      assert.equal(updateIfJobMatchesMock.mock.callCount(), 0);
    });

    it('giá trị biên: Rhythm trả về HTTP 499 thì ghi ERROR và thông báo cho chủ bài hát', async () => {
      const { updateIfJobMatchesMock, notifyMock, schedulePollMock } = mockAnalysisFlow();
      mockFetchResponses(jsonResponse(499));

      await analysisService.poll('s1', 'job-1');

      assert.equal((updateIfJobMatchesMock.mock.calls[0].arguments[2] as any).analysisError, 'Không thể kiểm tra kết quả phân tích (HTTP 499).');
      assert.equal(notifyMock.mock.callCount(), 1);
      assert.equal(schedulePollMock.mock.callCount(), 0);
    });

    it('ghi ERROR khi analysisId trả về không khớp với job đang chờ', async () => {
      const { updateIfJobMatchesMock } = mockAnalysisFlow();
      mockFetchResponses(jsonResponse(200, createRhythmMetadata({ analysisId: 'job-OTHER' })));

      await analysisService.poll('s1', 'job-1');

      assert.equal((updateIfJobMatchesMock.mock.calls[0].arguments[2] as any).analysisError, 'Kết quả Rhythm không khớp với yêu cầu phân tích.');
    });

    it('job thất bại trên Rhythm: ghi thông báo lỗi của Rhythm và thông báo cho chủ bài hát', async () => {
      const { updateIfJobMatchesMock, notifyMock } = mockAnalysisFlow();
      mockFetchResponses(jsonResponse(200, createRhythmMetadata({ status: 'failed', error: { code: 'E1', message: 'Không nhận ra giọng' } })));

      await analysisService.poll('s1', 'job-1');

      assert.equal((updateIfJobMatchesMock.mock.calls[0].arguments[2] as any).analysisError, 'Không nhận ra giọng');
      assert.equal(notifyMock.mock.callCount(), 1);
    });

    it('ghi ERROR khi job completed nhưng không có artifactUrl', async () => {
      const { updateIfJobMatchesMock } = mockAnalysisFlow();
      mockFetchResponses(jsonResponse(200, createRhythmMetadata({ artifactUrl: null })));

      await analysisService.poll('s1', 'job-1');

      assert.equal((updateIfJobMatchesMock.mock.calls[0].arguments[2] as any).analysisError, 'Rhythm trả về trạng thái phân tích không hợp lệ.');
    });
  });

  describe('poll → finishReady (tải file phân tích)', () => {
    it('tải artifact khớp job: lưu READY với URL tuyệt đối và thông báo phân tích xong', async () => {
      const { updateIfJobMatchesMock, notifyMock } = mockAnalysisFlow();
      const fetchMock = mockFetchResponses(jsonResponse(200, createRhythmMetadata()), jsonResponse(200, createArtifact()));

      await analysisService.poll('s1', 'job-1');

      assert.equal(fetchMock.mock.calls[1].arguments[0], `${RHYTHM_BASE_URL}/artifacts/job-1.json`);
      assert.deepEqual(updateIfJobMatchesMock.mock.calls[0].arguments[2], {
        analysisStatus: 'READY',
        analysisFileUrl: `${RHYTHM_BASE_URL}/artifacts/job-1.json`,
        analysisError: null
      });
      assert.equal((notifyMock.mock.calls[0].arguments[1] as any).title, 'Bản thu mẫu đã phân tích xong');
    });

    it('bỏ qua kết quả cũ khi sheet đã chuyển sang job khác: không tải artifact, không cập nhật', async () => {
      const { updateIfJobMatchesMock } = mockAnalysisFlow(createMockSheetForAnalysis({ analysisJobId: 'job-2' }));
      const fetchMock = mockFetchResponses(jsonResponse(200, createRhythmMetadata()), jsonResponse(200, createArtifact()));

      await analysisService.poll('s1', 'job-1');

      assert.equal(fetchMock.mock.callCount(), 1);
      assert.equal(updateIfJobMatchesMock.mock.callCount(), 0);
    });

    it('giá trị biên: KHÔNG thông báo khi job khác đã hoàn tất trước (updateIfJobMatches = false)', async () => {
      const { notifyMock } = mockAnalysisFlow(createMockSheetForAnalysis(), false);
      mockFetchResponses(jsonResponse(200, createRhythmMetadata()), jsonResponse(200, createArtifact()));

      await analysisService.poll('s1', 'job-1');

      assert.equal(notifyMock.mock.callCount(), 0);
    });
  });

  describe('start / stop / resumePending', () => {
    it('start() gọi hai lần chỉ tạo một timer, stop() xóa timer', async () => {
      const listMock = mock.method(SheetMusicRepository, 'listProcessingAnalysis', async () => []);

      try {
        AnalysisService.start();
        const timer = analysisService.resumeTimer;
        AnalysisService.start();

        assert.ok(timer);
        assert.equal(analysisService.resumeTimer, timer);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(listMock.mock.callCount(), 1);
      } finally {
        AnalysisService.stop();
      }
      assert.equal(analysisService.resumeTimer, undefined);
    });

    it('nuốt lỗi khi đọc danh sách job đang xử lý thất bại và KHÔNG hẹn giờ poll', async () => {
      const schedulePollMock = mock.method(analysisService, 'schedulePoll', () => {});
      mock.method(SheetMusicRepository, 'listProcessingAnalysis', async () => {
        throw new Error('DB down');
      });

      await analysisService.resumePending();

      assert.equal(schedulePollMock.mock.callCount(), 0);
    });
  });
});
