import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import F from './PracticeCommunityFixture.ts';
import TestDatabase from './TestDatabase.ts';

type TestUser = Awaited<ReturnType<typeof TestDatabase.createUser>>;
type Submission = Awaited<ReturnType<typeof F.createSubmission>>;

const M = F.messages;

describe('Report 5.2 – Verified Recordings', () => {
  let gvA: TestUser;
  let gvB: TestUser;
  let sv1: TestUser;
  let sv2: TestUser;
  let admin: TestUser;
  let tranhId: string;
  let classId: string;
  let as1: string;
  let p1: string;
  let s1: string;

  // Class $C1 of GV-A has assignment $AS1 on sheet $S1 of song $P1; GV-B does not teach it
  beforeEach(async () => {
    await TestDatabase.reset();
    gvA = await F.teacher('GV-A');
    gvB = await F.teacher('GV-B');
    sv1 = await F.student('SV-1');
    sv2 = await F.student('SV-2');
    admin = await F.admin();
    tranhId = (await TestDatabase.createInstrument('Đàn tranh')).id;
    classId = (await TestDatabase.createClass(gvA.id, tranhId, { name: 'Lớp C1' })).id;
    await TestDatabase.addMember(classId, sv1.id, gvA.id);
    p1 = (await F.createSong(tranhId, 'Lý ngựa ô')).id;
    s1 = (await F.createSheet(p1, tranhId)).id;
    as1 = (await TestDatabase.createAssignment(classId, gvA.id, { kind: 'BONUS', sheetMusicId: s1 })).id;
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  // $SUB1: COMPLETED, accuracy 85, the student agreed to share it
  async function createSubmission(overrides: Partial<Submission> = {}): Promise<Submission> {
    const upload = await F.createUpload(sv1.id);
    return F.createSubmission({
      studentId: sv1.id, pieceId: p1, sheetMusicId: s1, assignmentId: as1, accuracy: 85, shareConsent: true,
      studentUploadId: upload.id, fileUrl: upload.url, ...(overrides as object)
    });
  }

  const review = (id: string, body: object, user: TestUser = gvA) => F.post(`/submissions/${id}/review`, body, user);
  const consent = (id: string, body: object, user: TestUser = sv1) => F.put(`/submissions/${id}/sharing-consent`, body, user);
  const setVisibility = (id: string, body: object, user: TestUser = gvA) => F.patch(`/verified-contents/${id}/visibility`, body, user);
  const revoke = (id: string, body: object, user: TestUser = gvA) => F.post(`/verified-contents/${id}/revoke`, body, user);
  const stored = (id: string) => TestDatabase.prisma.verifiedContent.findUniqueOrThrow({ where: { id } });
  const library = (query: string, user?: TestUser) => F.get(`/library/pieces/${p1}/verified-recordings${query}`, user);

  // Content approved by GV-A, as after ITC-VC-001 (VISIBLE, version 1)
  async function createContent(overrides: Partial<Submission> = {}): Promise<{ id: string; submissionId: string }> {
    const submission = await createSubmission(overrides);
    const response = await review(submission.id, { decision: 'APPROVE' });
    if (response.status !== 200) throw new Error(`approve failed: ${JSON.stringify(response.body)}`);
    return { id: response.body.data.verifiedContentId as string, submissionId: submission.id };
  }

  async function createHiddenContent(): Promise<{ id: string; submissionId: string }> {
    const content = await createContent();
    const hidden = await setVisibility(content.id, { status: 'HIDDEN', version: 1 });
    if (hidden.status !== 200) throw new Error(`hide failed: ${JSON.stringify(hidden.body)}`);
    return content;
  }

  describe('Share consent and review (GET, POST /submissions/:id/review; PUT /submissions/:id/sharing-consent)', () => {
    it('ITC-VC-001 a lecturer approval creates visible verified content', async () => {
      const sub1 = await createSubmission();
      const before = await F.get(`/submissions/${sub1.id}/review`, gvA);
      expect(before.status).toBe(200);
      expect(before.body.data.canReview).toBe(true);

      const approved = await review(sub1.id, { decision: 'APPROVE' });
      expect(approved.status).toBe(200);
      expect(approved.body.data.review.status).toBe('APPROVED');
      expect(approved.body.data.verifiedContentId).toEqual(expect.any(String));
      expect((await stored(approved.body.data.verifiedContentId)).status).toBe('VISIBLE');
      expect((await F.notificationsOf(sv1.id)).map((item) => item.title)).toEqual(['Bản thu đã được xác minh']);

      F.expectError(await review(sub1.id, { decision: 'REJECT', reason: 'x' }), 409, { message: 'Bài nộp đã có quyết định xét duyệt.' });
    });

    it('ITC-VC-002 reject needs a reason; approving without an AI result needs manual', async () => {
      const sub2 = await createSubmission({ status: 'FAILED', accuracy: null });
      const reject = await review(sub2.id, { decision: 'REJECT' });
      F.expectValidationError(reject, 'reason');
      expect(reject.body.errors[0].message).toBe('Vui lòng nhập lý do từ chối.');
      F.expectError(await review(sub2.id, { decision: 'APPROVE' }), 409, { message: 'Vui lòng xác nhận xét duyệt thủ công khi chưa có kết quả AI.' });
      expect((await review(sub2.id, { decision: 'APPROVE', manual: true })).status).toBe(200);
    });

    it('ITC-VC-003 withdrawing consent hides visible content', async () => {
      const vc1 = await createContent();
      const response = await consent(vc1.submissionId, { isGranted: false });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Đã cập nhật quyền chia sẻ bản thu.');
      expect(response.body.data.shareConsent).toBe(false);
      expect(await stored(vc1.id)).toMatchObject({ status: 'HIDDEN', reason: 'Sinh viên đã rút đồng ý chia sẻ.' });
    });

    it('ITC-VC-004 review / consent permissions', async () => {
      const sub1 = await createSubmission();
      F.expectForbidden(await review(sub1.id, { decision: 'APPROVE' }, gvB));
      F.expectForbidden(await review(sub1.id, { decision: 'APPROVE' }, admin));
      F.expectForbidden(await consent(sub1.id, { isGranted: true }, sv2));
      F.expectForbidden(await F.get(`/submissions/${sub1.id}/review`, sv2));
    });
  });

  describe('Manage verified content (GET /verified-contents, /:id; PATCH /:id/visibility; POST /:id/revoke; GET /:id/audio)', () => {
    it('ITC-VC-005 hiding then showing again by version', async () => {
      const vc1 = await createContent();
      const list = await F.get('/verified-contents?status=ALL&sortBy=accuracy', gvA);
      expect(list.status).toBe(200);
      expect(list.body.data.items).toEqual([expect.objectContaining({ id: vc1.id, canHide: true })]);

      const hidden = await setVisibility(vc1.id, { status: 'HIDDEN', version: 1, reason: 'Tạm ẩn' });
      expect(hidden.status).toBe(200);
      expect(hidden.body.message).toBe('Đã cập nhật nội dung xác minh.');
      expect(hidden.body.data.version).toBe(2);

      F.expectError(await setVisibility(vc1.id, { status: 'VISIBLE', version: 1 }), 409, { message: M.contentChanged });
      expect((await setVisibility(vc1.id, { status: 'VISIBLE', version: 2 })).status).toBe(200);
    });

    it('ITC-VC-006 revoking needs a reason and cannot be undone', async () => {
      const vc1 = await createHiddenContent();
      expect((await setVisibility(vc1.id, { status: 'VISIBLE', version: 2 })).body.data.version).toBe(3);

      F.expectError(await revoke(vc1.id, { version: 3 }, admin), 400, { message: 'Vui lòng nhập lý do thu hồi.' });
      const revoked = await revoke(vc1.id, { version: 3, reason: 'Vi phạm bản quyền' }, admin);
      expect(revoked.status).toBe(200);
      expect(revoked.body.data.status).toBe('REVOKED');
      expect((await F.notificationsOf(sv1.id))[0].title).toBe('Xác minh bản thu đã được thu hồi');

      F.expectError(await setVisibility(vc1.id, { status: 'VISIBLE', version: 4 }, admin), 409, { message: M.contentRevoked });
      F.expectValidationError(await setVisibility(vc1.id, { status: 'REVOKED', version: 4 }, admin), 'status');
    });

    it('ITC-VC-007 another lecturer cannot manage it; a student cannot reach the management API', async () => {
      const vc1 = await createContent();
      F.expectForbidden(await setVisibility(vc1.id, { status: 'HIDDEN', version: 1 }, gvB));
      F.expectForbidden(await F.get('/verified-contents', sv1));
    });
  });

  describe('Library and audio files (GET /library/pieces/:id/verified-recordings, /library/verified-recordings/:id/audio, /submissions/:id/audio)', () => {
    it('ITC-VC-008 students only see visible recordings in the library and can play them', async () => {
      const vc1 = await createContent();
      const list = await library(`?instrumentId=${tranhId}`, sv2);
      expect(list.status).toBe(200);
      expect(list.body.data.items).toEqual([expect.objectContaining({ id: vc1.id, reason: null })]);

      const audio = await F.get(`/library/verified-recordings/${vc1.id}/audio`, sv2);
      expect(audio.status).toBe(200);
      expect(audio.headers['content-type']).toContain('audio/wav');

      F.expectValidationError(await library('', sv2), 'instrumentId');
    });

    it('ITC-VC-009 a submission file is only served to allowed users', async () => {
      const sub1 = await createSubmission();
      const url = `/submissions/${sub1.id}/audio`;
      expect((await F.get(url, sv1)).status).toBe(200);
      expect((await F.get(url, gvA)).status).toBe(200);
      F.expectForbidden(await F.get(url, sv2));
      F.expectUnauthorized(await F.get(url));
    });
  });

  describe('More review and consent cases (POST /submissions/:id/review; PUT /submissions/:id/sharing-consent)', () => {
    it('ITC-VC-010 a submission that is still being analysed cannot be reviewed', async () => {
      const sub3 = await createSubmission({ status: 'PROCESSING', accuracy: null });
      F.expectError(await review(sub3.id, { decision: 'APPROVE', manual: true }), 409, { message: 'Bản thu đang được phân tích. Vui lòng chờ.' });
    });

    it('ITC-VC-011 approving fails when the recording file is no longer available', async () => {
      const sub4 = await createSubmission({ fileDeletedAt: new Date(), studentUploadId: null, fileUrl: null });
      F.expectError(await review(sub4.id, { decision: 'APPROVE' }), 409, { message: 'File bản thu không còn khả dụng.' });
      expect(await TestDatabase.prisma.verifiedContent.count({ where: { submissionId: sub4.id } })).toBe(0);
    });

    it('ITC-VC-012 approving fails when the same file is used by another analysis', async () => {
      const sub1 = await createSubmission();
      const template = await F.createUpload(gvA.id);
      await TestDatabase.prisma.audioEvaluationRequest.create({
        data: {
          evaluationId: randomUUID(), messageId: randomUUID(), ownerId: sv1.id, templateUploadId: template.id,
          studentUploadId: sub1.studentUploadId as string, instrumentCode: 'dan_tranh'
        }
      });
      F.expectError(await review(sub1.id, { decision: 'APPROVE' }), 409, {
        message: 'File đang được dùng bởi luồng phân tích khác. Vui lòng dùng bản tải lên riêng trước khi xác minh.'
      });
    });

    it('ITC-VC-013 approving without share consent creates hidden content', async () => {
      const sub5 = await createSubmission({ shareConsent: false });
      const response = await review(sub5.id, { decision: 'APPROVE' });
      expect(response.status).toBe(200);
      expect(response.body.data.review.status).toBe('APPROVED');
      expect(await F.notificationsOf(sv1.id)).toEqual([{
        title: 'Bản thu đã được xác minh', body: 'Giảng viên đã xác minh. Bản thu chưa được chia sẻ vì bạn chưa đồng ý.'
      }]);
      expect((await stored(response.body.data.verifiedContentId)).status).toBe('HIDDEN');
    });

    it('ITC-VC-014 rejecting with a reason creates no content and tells the student', async () => {
      const sub1 = await createSubmission();
      const response = await review(sub1.id, { decision: 'REJECT', reason: 'Sai nhịp đoạn cuối' });
      expect(response.status).toBe(200);
      expect(response.body.data.review.status).toBe('REJECTED');
      expect(await F.notificationsOf(sv1.id)).toEqual([{ title: 'Bản thu chưa được duyệt', body: 'Sai nhịp đoạn cuối' }]);
      expect(await TestDatabase.prisma.verifiedContent.count({ where: { submissionId: sub1.id } })).toBe(0);
    });

    it('ITC-VC-015 share consent errors: unknown submission and wrong body', async () => {
      const sub1 = await createSubmission();
      F.expectError(await consent(randomUUID(), { isGranted: true }), 404, { message: 'Bài nộp không tồn tại.' });
      F.expectError(await consent(sub1.id, { isGranted: 'yes' }), 400, { field: 'isGranted', message: M.invalidData });
      F.expectError(await consent('abc', { isGranted: true }), 400, { field: 'id', message: M.invalidData });
    });
  });

  describe('More management cases (GET /verified-contents, /:id, /:id/audio; PATCH /:id/visibility)', () => {
    it('ITC-VC-016 the Admin can manage verified content of any class', async () => {
      const vc1 = await createContent();
      const response = await setVisibility(vc1.id, { status: 'HIDDEN', version: 1, reason: 'Kiểm tra' }, admin);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Đã cập nhật nội dung xác minh.');
      expect(response.body.data).toMatchObject({ status: 'HIDDEN', version: 2 });
    });

    it('ITC-VC-017 the list filters, sort and paging', async () => {
      const contents: string[] = [];
      for (const title of ['Ly ngua phi', 'Trống cơm', 'Ly ngua o']) {
        const pieceId = (await F.createSong(tranhId, title)).id;
        const sheet = await F.createSheet(pieceId, tranhId);
        const assignment = await TestDatabase.createAssignment(classId, gvA.id, { kind: 'BONUS', sheetMusicId: sheet.id });
        contents.push((await createContent({ pieceId, sheetMusicId: sheet.id, assignmentId: assignment.id })).id);
      }
      const hidden = await createHiddenContent();
      const revoked = await createContent();
      expect((await revoke(revoked.id, { version: 1, reason: 'Thu hồi' })).status).toBe(200);

      const onlyHidden = await F.get('/verified-contents?status=HIDDEN', gvA);
      expect(onlyHidden.status).toBe(200);
      expect(onlyHidden.body.data.items).toEqual([expect.objectContaining({ id: hidden.id, status: 'HIDDEN' })]);

      const found = await F.get('/verified-contents?q=ly%20ngua&sortBy=pieceTitle&sortDir=asc', gvA);
      expect(found.status).toBe(200);
      expect(found.body.data.items.map((item: { id: string }) => item.id)).toEqual([contents[2], contents[0]]);

      F.expectError(await F.get('/verified-contents?pageSize=101', gvA), 400, { field: 'pageSize' });
      F.expectError(await F.get('/verified-contents?status=DELETED', gvA), 400, { field: 'status' });
    });

    it('ITC-VC-018 the detail and the management audio API', async () => {
      const vc2 = await createHiddenContent();
      const detail = await F.get(`/verified-contents/${vc2.id}`, gvA);
      expect(detail.status).toBe(200);
      expect(detail.body.data.status).toBe('HIDDEN');

      const audio = await F.get(`/verified-contents/${vc2.id}/audio`, gvA);
      expect(audio.status).toBe(200);
      expect(audio.headers['content-type']).toContain('audio/wav');

      F.expectForbidden(await F.get(`/verified-contents/${vc2.id}/audio`, sv2));
      F.expectError(await F.get(`/verified-contents/${randomUUID()}`, gvA), 404, { message: M.contentNotFound });
    });

    it('ITC-VC-019 content cannot be shown again without share consent, and status is required', async () => {
      const vc1 = await createContent();
      expect((await consent(vc1.submissionId, { isGranted: false })).status).toBe(200);
      F.expectError(await setVisibility(vc1.id, { status: 'VISIBLE', version: 2 }), 409, {
        message: 'Chưa có đồng ý chia sẻ hoặc bản nhạc nguồn không khả dụng.'
      });
      F.expectError(await setVisibility(vc1.id, { version: 2 }), 400, { message: 'Vui lòng chọn trạng thái.' });
    });

    it('ITC-VC-020 hiding content tells the student and writes an audit log', async () => {
      const vc1 = await createContent();
      expect((await setVisibility(vc1.id, { status: 'HIDDEN', version: 1, reason: 'Tạm ẩn' })).status).toBe(200);
      expect((await F.notificationsOf(sv1.id))[0].title).toBe('Bản thu tham khảo đã được ẩn');
      const log = await TestDatabase.prisma.auditLog.findFirstOrThrow({ where: { entityId: vc1.id }, orderBy: { createdAt: 'desc' } });
      expect(log.action).toBe('VERIFIED_HIDDEN');
    });
  });

  describe('More library cases (GET /library/pieces/:id/verified-recordings, /library/verified-recordings/:id/audio)', () => {
    it('ITC-VC-021 a Guest cannot use the library recordings API and hidden content is not shown', async () => {
      const vc1 = await createContent();
      const vc2 = await createHiddenContent();
      F.expectUnauthorized(await library(`?instrumentId=${tranhId}`));

      const list = await library(`?instrumentId=${tranhId}`, sv2);
      expect(list.status).toBe(200);
      expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual([vc1.id]);
      expect((await F.get(`/library/verified-recordings/${vc2.id}/audio`, sv2)).status).toBe(404);
    });
  });

  describe('More checks on versions, revoked content and input', () => {
    it('ITC-VC-022 a change with an old version number', async () => {
      const vc1 = await createContent();
      await TestDatabase.prisma.verifiedContent.update({ where: { id: vc1.id }, data: { version: 2 } });
      F.expectError(await setVisibility(vc1.id, { status: 'HIDDEN', version: 1 }), 409, { message: M.contentChanged });
      expect(await stored(vc1.id)).toMatchObject({ status: 'VISIBLE', version: 2 });
    });

    it('ITC-VC-023 revoked content cannot be shown again', async () => {
      const vc2 = await createContent();
      const revoked = await revoke(vc2.id, { version: 1, reason: 'Thu hồi' });
      F.expectError(await setVisibility(vc2.id, { status: 'VISIBLE', version: revoked.body.data.version }), 409, { message: M.contentRevoked });
    });

    it('ITC-VC-024 an unknown or wrong content id', async () => {
      F.expectError(await F.get(`/verified-contents/${randomUUID()}`, gvA), 404, { message: M.contentNotFound });
      F.expectError(await F.get('/verified-contents/abc', gvA), 400, { field: 'id' });
    });

    it('ITC-VC-025 the review body is validated', async () => {
      const submission = await createSubmission();
      F.expectError(await review(submission.id, { decision: 'MAYBE' }), 400, { field: 'decision' });
      F.expectError(await review(submission.id, { decision: 'REJECT', reason: 'a'.repeat(2001) }), 400, { field: 'reason' });
      expect((await review(submission.id, { decision: 'APPROVE', score: 9 })).status).toBe(400);
    });

    it('ITC-VC-026 the list query is validated', async () => {
      for (const query of ['status=DELETED', 'sortBy=date', 'pageSize=101', `q=${'a'.repeat(201)}`]) {
        F.expectError(await F.get(`/verified-contents?${query}`, gvA), 400, { message: M.invalidData });
      }
    });

    it('ITC-VC-027 the library list needs an instrument', async () => {
      const low = await createContent({ accuracy: 70 });
      const high = await createContent({ accuracy: 95 });
      F.expectError(await library('', sv1), 400, { field: 'instrumentId' });

      const sorted = await library(`?instrumentId=${tranhId}&sortBy=accuracy`, sv1);
      expect(sorted.status).toBe(200);
      expect(sorted.body.data.items.map((item: { id: string }) => item.id)).toEqual([high.id, low.id]);
    });
  });
});
