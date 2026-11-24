/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/ChallengeService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import ChallengeServiceClass from '../../src/modules/challenges/service/ChallengeService.ts';
import ChallengeRulesClass from '../../src/modules/challenges/service/ChallengeRules.ts';
import ChallengeWeekCalculatorClass from '../../src/modules/challenges/service/ChallengeWeekCalculator.ts';
import ChallengeAccessServiceClass from '../../src/modules/challenges/service/ChallengeAccessService.ts';
import ChallengeReferenceServiceClass from '../../src/modules/challenges/service/ChallengeReferenceService.ts';
import ChallengeQueryServiceClass from '../../src/modules/challenges/service/ChallengeQueryService.ts';
import ChallengeRepositoryClass from '../../src/modules/challenges/repository/ChallengeRepository.ts';
import MemberRepositoryClass from '../../src/modules/classes/repository/MemberRepository.ts';
import NotificationServiceClass from '../../src/modules/platform/service/NotificationService.ts';
import GradingSettingsServiceClass from '../../src/modules/platform/service/GradingSettingsService.ts';
import AuditLoggerClass from '../../src/lib/AuditLogger.ts';
import PrismaClientProviderClass from '../../src/config/PrismaClient.ts';
import ChallengeDTOClass from '../../src/modules/challenges/dto/ChallengeDTO.ts';
import ChallengeConstant from '../../src/modules/challenges/constant/ChallengeConstant.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { E, R, expectAppError, method, sheet, setValue, stub, stubSync, tc } = UnitTestKit;
  const ChallengeService: any = ChallengeServiceClass;
  const Rules: any = ChallengeRulesClass;
  const Week: any = ChallengeWeekCalculatorClass;
  const Access: any = ChallengeAccessServiceClass;
  const Reference: any = ChallengeReferenceServiceClass;
  const Query: any = ChallengeQueryServiceClass;
  const ChallengeRepository: any = ChallengeRepositoryClass;
  const MemberRepository: any = MemberRepositoryClass;
  const NotificationService: any = NotificationServiceClass;
  const GradingSettingsService: any = GradingSettingsServiceClass;
  const AuditLogger: any = AuditLoggerClass;
  const PrismaClientProvider: any = PrismaClientProviderClass;

  const M = {
    NOT_FOUND: 'Không tìm thấy thử thách.', TITLE_REQUIRED: 'Tiêu đề không được để trống.', TITLE_LONG: 'Tiêu đề không được vượt quá 100 ký tự.',
    DESCRIPTION_LONG: 'Mô tả không được vượt quá 2000 ký tự.', BPM_RANGE: 'BPM yêu cầu phải nằm trong khoảng từ 30 đến 240.', MAX_RANGE: 'Số lần nộp tối đa phải nằm trong khoảng từ 1 đến 10.',
    ACCURACY_RANGE: 'Độ chính xác tối thiểu phải nằm trong khoảng từ 0 đến 100.',
    NOT_DRAFT_EDIT: 'Không thể sửa thử thách vì thử thách đã được đăng.', NOT_DRAFT_DELETE: 'Không thể xóa thử thách vì thử thách đã được đăng.', NOT_DRAFT_PUBLISH: 'Không thể đăng thử thách vì thử thách đã được đăng.',
    NOT_MONDAY: 'Không thể đăng thử thách vì tuần phải bắt đầu vào thứ Hai.', PAST_WEEK: 'Không thể đăng thử thách vì không thể chọn tuần đã kết thúc.',
    CLASS_NOT_FOUND: 'Không tìm thấy lớp học.', CLASS_FINISHED: 'Không thể thay đổi lớp vì lớp đã kết thúc.', MISMATCH: 'Lớp đã chọn không học nhạc cụ của thử thách.',
    CLASS_EMPTY: 'Không thể đăng thử thách vì lớp chưa có sinh viên.', OVERLAP: 'Không thể đăng thử thách vì lớp đã có thử thách khác trong tuần này.',
    PIECE_UNAVAILABLE: 'Bài nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.', PIECE_NOT_READY: 'Không thể đăng thử thách vì bài nhạc chưa có bản thu mẫu hoặc chưa phân tích xong.',
    PUBLISH_FAILED: 'Đăng thử thách thất bại. Vui lòng thử lại.', DRAFT_FAILED: 'Lưu nháp thử thách thất bại. Vui lòng thử lại.'
  };
  const MONDAY = '2030-01-07'; // a future Monday
  const PAST_MONDAY = '2020-01-06';
  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'ch-1', title: 'Thử thách Lưu thủy', description: null, status: 'DRAFT', createdById: 'GV-A', instrumentId: 'i-tranh', pieceId: 'p1',
    instrument: { id: 'i-tranh', name: 'Đàn tranh' }, piece: { id: 'p1', title: 'Lưu thủy' }, classes: [{ class: { id: 'c1', name: 'DTR101.M1' } }, { class: { id: 'c2', name: 'DTR101.M2' } }],
    startsAt: new Date('2030-01-06T17:00:00Z'), endsAt: new Date('2030-01-13T16:59:59.999Z'), minAccuracy: 70, requiredBpm: 80, maxSubmissions: 3, publishedAt: null,
    createdAt: new Date('2026-11-01T03:00:00Z'), updatedAt: new Date('2026-11-01T03:00:00Z'), ...overrides
  });
  const publishInput = (overrides: Record<string, unknown> = {}) => ({ title: 'Thử thách Lưu thủy', description: null, instrumentId: 'i-tranh', pieceId: 'p1', classIds: ['c1', 'c2'], weekStart: MONDAY, minAccuracy: 70, requiredBpm: 80, maxSubmissions: 3, publish: true, ...overrides });
  const klass = (id: string, overrides: Record<string, unknown> = {}) => ({ id, name: id === 'c1' ? 'DTR101.M1' : 'DTR101.M2', ownerId: 'GV-A', status: 'ACTIVE', instrumentId: 'i-tranh', coLecturers: [], ...overrides });
  const readyPiece = (overrides: Record<string, unknown> = {}) => ({ id: 'p1', visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null, instruments: [{ instrumentId: 'i-tranh' }], sheetMusic: [{ id: 's-main', visibility: 'PUBLIC', moderation: 'NORMAL', referenceAudioId: 'a1', analysisStatus: 'READY' }], ...overrides });
  const sheetState = (overrides: Record<string, unknown> = {}) => ({ visibility: 'PUBLIC', moderation: 'NORMAL', referenceAudioId: 'a1', analysisStatus: 'READY', ...overrides });
  const world = (options: { stored?: any; members?: Record<string, string[]>; overlapping?: string[]; piece?: unknown; classes?: Record<string, unknown>; createError?: Error; updated?: boolean; deleted?: boolean } = {}) => {
    let stored: any = options.stored ?? null;
    setValue(PrismaClientProvider, 'instance', { $transaction: async (work: (client: unknown) => unknown) => work({ tx: true }) });
    const created = stub(ChallengeRepository, 'create', (_l: string, data: any) => { if (options.createError) throw options.createError; stored = record({ ...data, id: 'ch-new', classes: [] }); return { id: 'ch-new' }; });
    const updated = stub(ChallengeRepository, 'update', (_id: string, data: any) => { if (options.updated === false) return false; stored = { ...stored, ...data }; return true; });
    stub(ChallengeRepository, 'findById', () => stored);
    const locks = stub(ChallengeRepository, 'lockClasses');
    stub(ChallengeRepository, 'lockChallenge');
    stub(ChallengeRepository, 'findClassForChallenge', (id: string) => (options.classes && id in options.classes ? options.classes[id] : klass(id)));
    stub(ChallengeRepository, 'findPieceForChallenge', () => (options.piece !== undefined ? options.piece : readyPiece()));
    const overlaps = stub(ChallengeRepository, 'findOverlappingClassIds', () => options.overlapping ?? []);
    const deletes = stub(ChallengeRepository, 'delete', () => options.deleted ?? true);
    const members = options.members ?? { c1: ['SV-1', 'SV-2'], c2: ['SV-2', 'SV-3'] };
    stub(MemberRepository, 'findActiveMemberIds', (classId: string) => new Set(members[classId] ?? []));
    const notified = stub(NotificationService, 'notifyUsers', () => 0);
    const audits = stub(AuditLogger, 'record');
    return { created, updated, locks, overlaps, deletes, notified, audits };
  };

  sheet('ChallengeService', 'CH', 'src/modules/challenges/service/ChallengeService.test.ts');
  method('ChallengeRules.validateDraft(input) / validatePublish(input)');
  tc('N/A', 'validateDraft({ title: "   " })', R('[{ field: "title", code: "MSG-35", message: "Tiêu đề không được để trống." }]'), 'Abnormal', () => assert.deepEqual(Rules.validateDraft({ title: '   ' }), [{ field: 'title', code: 'MSG-35', message: M.TITLE_REQUIRED }]));
  tc('N/A', 'validateDraft({ title: 100 chars }) / ({ title: 101 chars })', R('[] / [{ field: "title", code: "MSG-37", message: "Tiêu đề không được vượt quá 100 ký tự." }]'), 'Boundary', () => assert.deepEqual([Rules.validateDraft({ title: 'a'.repeat(100) }), Rules.validateDraft({ title: 'a'.repeat(101) })], [[], [{ field: 'title', code: 'MSG-37', message: M.TITLE_LONG }]]));
  tc('N/A', 'validateDraft({ title: "T", description: 2001 chars })', R('[{ field: "description", code: "MSG-37", message: "Mô tả không được vượt quá 2000 ký tự." }]'), 'Boundary', () => assert.deepEqual(Rules.validateDraft({ title: 'T', description: 'a'.repeat(2001) }), [{ field: 'description', code: 'MSG-37', message: M.DESCRIPTION_LONG }]));
  tc('N/A', 'validatePublish({ title: "T" }) (nothing else)', R('4 MSG-35 errors for instrumentId, pieceId, classIds, weekStart (optional numbers skipped)'), 'Abnormal', () => assert.deepEqual(Rules.validatePublish({ title: 'T', classIds: [] }).map((error: any) => [error.field, error.code]), [['instrumentId', 'MSG-35'], ['pieceId', 'MSG-35'], ['classIds', 'MSG-35'], ['weekStart', 'MSG-35']]));
  tc('N/A', 'validatePublish(full input with requiredBpm 29 / 241, minAccuracy 100.1, maxSubmissions 11)', R('MSG-03 "BPM yêu cầu phải nằm trong khoảng từ 30 đến 240.", "Độ chính xác tối thiểu phải nằm trong khoảng từ 0 đến 100.", "Số lần nộp tối đa phải nằm trong khoảng từ 1 đến 10."'), 'Boundary', () => {
    assert.deepEqual(Rules.validatePublish(publishInput({ requiredBpm: 29, minAccuracy: 100.1, maxSubmissions: 11 })).map((error: any) => error.message), [M.BPM_RANGE, M.ACCURACY_RANGE, M.MAX_RANGE]);
    assert.equal(Rules.validatePublish(publishInput({ requiredBpm: 241 }))[0].message, M.BPM_RANGE);
  });
  tc('N/A', 'validatePublish(full input with requiredBpm 30, minAccuracy 0, maxSubmissions 10)', R('[] (edges accepted)'), 'Boundary', () => assert.deepEqual(Rules.validatePublish(publishInput({ requiredBpm: 30, minAccuracy: 0, maxSubmissions: 10 })), []));
  method('ChallengeRules.displayStatus(challenge, now) / isPieceReady(piece, mainSheet) / overlaps(a, b)');
  tc('published 2030-01-07 → 2030-01-13 (UTC+7)', 'now = before start / inside / after end; status DRAFT', R('"UPCOMING" / "ACTIVE" / "ENDED" / "DRAFT"'), 'Normal', () => {
    const published = { status: 'PUBLISHED', startsAt: new Date('2030-01-06T17:00:00Z'), endsAt: new Date('2030-01-13T16:59:59.999Z') };
    assert.deepEqual([Rules.displayStatus(published, new Date('2030-01-06T16:59:59Z')), Rules.displayStatus(published, new Date('2030-01-10T00:00:00Z')), Rules.displayStatus(published, new Date('2030-01-13T17:00:00Z')), Rules.displayStatus({ ...published, status: 'DRAFT' }, new Date('2030-01-10T00:00:00Z'))], ['UPCOMING', 'ACTIVE', 'ENDED', 'DRAFT']);
  });
  tc('N/A', 'isPieceReady(public piece, main sheet READY with reference audio) / analysis PENDING / no reference audio / no main sheet', R('true / false / false / false'), 'Normal', () => {
    const piece = { visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null };
    assert.deepEqual([Rules.isPieceReady(piece, sheetState()), Rules.isPieceReady(piece, sheetState({ analysisStatus: 'PENDING' })), Rules.isPieceReady(piece, sheetState({ referenceAudioId: null })), Rules.isPieceReady(piece, null)], [true, false, false, false]);
  });
  tc('N/A', 'overlaps(["c1", "c2"], ["c2"]) / (["c1"], []) ', R('true / false'), 'Normal', () => assert.deepEqual([Rules.overlaps(['c1', 'c2'], ['c2']), Rules.overlaps(['c1'], [])], [true, false]));
  method('ChallengeWeekCalculator.weekBounds / isMonday / resolvePeriod / isPastWeek');
  tc('N/A', 'weekBounds("2030-01-07")', R('{ startsAt: 2030-01-06T17:00:00.000Z, endsAt: 2030-01-13T16:59:59.999Z } (Mon 00:00 → Sun 23:59:59.999 UTC+7)'), 'Normal', () => { const bounds = Week.weekBounds('2030-01-07'); assert.deepEqual([bounds.startsAt.toISOString(), bounds.endsAt.toISOString()], ['2030-01-06T17:00:00.000Z', '2030-01-13T16:59:59.999Z']); });
  tc('N/A', 'isMonday("2030-01-07") / ("2030-01-08") / ("2030-02-30")', R('true / false / false'), 'Boundary', () => assert.deepEqual([Week.isMonday('2030-01-07'), Week.isMonday('2030-01-08'), Week.isMonday('2030-02-30')], [true, false, false]));
  tc('N/A', 'resolvePeriod("2030-01-07", now = 2030-01-09T05:00Z) (current week)', R('{ startsAt: now, endsAt: 2030-01-13T16:59:59.999Z } (starts immediately)'), 'Boundary', () => { const now = new Date('2030-01-09T05:00:00Z'); const period = Week.resolvePeriod('2030-01-07', now); assert.deepEqual([period.startsAt, period.endsAt.toISOString()], [now, '2030-01-13T16:59:59.999Z']); });
  tc('N/A', 'isPastWeek("2030-01-07", now = 2030-01-13T16:59:59.999Z) / (now = 2030-01-13T17:00Z)', R('false / true'), 'Boundary', () => assert.deepEqual([Week.isPastWeek('2030-01-07', new Date('2030-01-13T16:59:59.999Z')), Week.isPastWeek('2030-01-07', new Date('2030-01-13T17:00:00Z'))], [false, true]));
  method('ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId) / assertDraft(record, action)');
  tc('challenge ch-1 created by GV-B', 'assertOwnedChallenge("ch-1", "GV-A")', E(404, null, M.NOT_FOUND, undefined, 'existence not leaked'), 'Abnormal', async () => { stub(ChallengeRepository, 'findById', () => record({ createdById: 'GV-B' })); await expectAppError(() => Access.assertOwnedChallenge('ch-1', 'GV-A'), 404, null, M.NOT_FOUND); });
  tc('challenge ch-1 PUBLISHED', 'assertDraft(record, "sửa thử thách")', E(409, 'MSG-08', M.NOT_DRAFT_EDIT), 'Abnormal', () => expectAppError(() => Access.assertDraft(record({ status: 'PUBLISHED' }), 'sửa thử thách'), 409, 'MSG-08', M.NOT_DRAFT_EDIT));
  method('ChallengeReferenceService.assertWeek / assertClasses / assertPiece');
  tc('N/A', 'assertWeek("2030-01-08", now)', E(400, 'MSG-08', M.NOT_MONDAY, 'weekStart'), 'Abnormal', () => expectAppError(() => Reference.assertWeek('2030-01-08', new Date()), 400, 'MSG-08', M.NOT_MONDAY, 'weekStart'));
  tc('N/A', 'assertWeek("2020-01-06", now)', E(400, 'MSG-04', M.PAST_WEEK, 'weekStart', 'code MSG-04 does not match the MSG-08 text'), 'Abnormal', () => expectAppError(() => Reference.assertWeek(PAST_MONDAY, new Date()), 400, 'MSG-04', M.PAST_WEEK, 'weekStart'));
  tc('N/A', 'assertWeek(null, now)', R('no error (draft without week)'), 'Boundary', () => assert.equal(Reference.assertWeek(null, new Date()), undefined));
  tc('classes c1, c2 of GV-A, ACTIVE, Đàn tranh, both with students', 'assertClasses(["c1", "c2"], "i-tranh", "GV-A", { requireStudents: true })', R('[{ id: "c1", name: "DTR101.M1" }, { id: "c2", name: "DTR101.M2" }]'), 'Normal', async () => { world(); assert.deepEqual((await Reference.assertClasses(['c1', 'c2'], 'i-tranh', 'GV-A', { requireStudents: true })).map((item: any) => item.id), ['c1', 'c2']); });
  tc('class c2 owned by GV-B', 'assertClasses(["c1", "c2"], …, "GV-A")', E(404, null, M.CLASS_NOT_FOUND), 'Abnormal', async () => { world({ classes: { c2: klass('c2', { ownerId: 'GV-B' }) } }); await expectAppError(() => Reference.assertClasses(['c1', 'c2'], 'i-tranh', 'GV-A', { requireStudents: false }), 404, null, M.CLASS_NOT_FOUND); });
  tc('class c1 ENDED', 'assertClasses(["c1"], …)', E(409, 'MSG-08', M.CLASS_FINISHED), 'Abnormal', async () => { world({ classes: { c1: klass('c1', { status: 'ENDED' }) } }); await expectAppError(() => Reference.assertClasses(['c1'], 'i-tranh', 'GV-A', { requireStudents: false }), 409, 'MSG-08', M.CLASS_FINISHED); });
  tc('class c1 teaches Đàn bầu', 'assertClasses(["c1"], "i-tranh", …)', E(400, null, M.MISMATCH, 'classIds'), 'Abnormal', async () => { world({ classes: { c1: klass('c1', { instrumentId: 'i-bau' }) } }); await expectAppError(() => Reference.assertClasses(['c1'], 'i-tranh', 'GV-A', { requireStudents: false }), 400, null, M.MISMATCH, 'classIds'); });
  tc('class c1 has no active student', 'assertClasses(["c1"], …, { requireStudents: true }) / { requireStudents: false }', 'Return: [c1] when students are not required\nException: AppError(statusCode=409, code="MSG-08") – "Không thể đăng thử thách vì lớp chưa có sinh viên." when publishing\nLog Message: N/A', 'Boundary', async () => {
    world({ members: { c1: [] } }); assert.equal((await Reference.assertClasses(['c1'], 'i-tranh', 'GV-A', { requireStudents: false })).length, 1);
    await expectAppError(() => Reference.assertClasses(['c1'], 'i-tranh', 'GV-A', { requireStudents: true }), 409, 'MSG-08', M.CLASS_EMPTY);
  });
  tc('piece p1 public with READY main sheet s-main', 'assertPiece("p1", "i-tranh", { requireReady: true })', R('"s-main"'), 'Normal', async () => { world(); assert.equal(await Reference.assertPiece('p1', 'i-tranh', { requireReady: true }), 's-main'); });
  tc('N/A', 'assertPiece(null, …)', R('null (draft without piece)'), 'Boundary', async () => assert.equal(await Reference.assertPiece(null, 'i-tranh', { requireReady: true }), null));
  tc('piece p1 hidden by admin / deleted / not for Đàn tranh', 'assertPiece("p1", "i-tranh", …)', E(400, 'MSG-48', M.PIECE_UNAVAILABLE, 'pieceId'), 'Abnormal', async () => {
    for (const piece of [readyPiece({ moderation: 'ADMIN_HIDDEN' }), readyPiece({ deletedAt: new Date() }), readyPiece({ instruments: [{ instrumentId: 'i-bau' }] }), null]) { world({ piece }); await expectAppError(() => Reference.assertPiece('p1', 'i-tranh', { requireReady: false }), 400, 'MSG-48', M.PIECE_UNAVAILABLE, 'pieceId'); }
  });
  tc('main sheet s-main still analysing', 'assertPiece("p1", "i-tranh", { requireReady: true }) / { requireReady: false }', 'Return: "s-main" when saving a draft\nException: AppError(statusCode=400, code="MSG-48", field="pieceId") – "Không thể đăng thử thách vì bài nhạc chưa có bản thu mẫu hoặc chưa phân tích xong." when publishing\nLog Message: N/A', 'Boundary', async () => {
    world({ piece: readyPiece({ sheetMusic: [{ id: 's-main', ...sheetState({ analysisStatus: 'PROCESSING' }) }] }) });
    assert.equal(await Reference.assertPiece('p1', 'i-tranh', { requireReady: false }), 's-main'); await expectAppError(() => Reference.assertPiece('p1', 'i-tranh', { requireReady: true }), 400, 'MSG-48', M.PIECE_NOT_READY, 'pieceId');
  });
  method('create(lecturerId, input)');
  tc('classes c1 (SV-1, SV-2) and c2 (SV-2, SV-3); ready piece; no overlapping challenge', 'lecturerId="GV-A"; input={ title: "Thử thách Lưu thủy", instrumentId: "i-tranh", pieceId: "p1", classIds: ["c1", "c2"], weekStart: "2030-01-07", publish: true }',
    R('{ id: "ch-new", status: "PUBLISHED", displayStatus: "UPCOMING", weekStart: "2030-01-07", startsAt: "2030-01-06T17:00:00.000Z" }', 'lockClasses(["c1", "c2"]); AuditLogger.record { action: "CHALLENGE_PUBLISH", entityId: "ch-new" }; notifyUsers(["SV-1", "SV-2", "SV-3"] once each, { title: "Thử thách mới", body: "DTR101.M1, DTR101.M2 · Thử thách Lưu thủy", link: "/community/challenges/ch-new" })'), 'Normal', async () => {
      const { created, locks, audits, notified } = world(); const dto = await ChallengeService.create('GV-A', publishInput());
      assert.deepEqual([dto.id, dto.status, dto.displayStatus, dto.weekStart, dto.startsAt], ['ch-new', 'PUBLISHED', 'UPCOMING', MONDAY, '2030-01-06T17:00:00.000Z']);
      assert.deepEqual([created[0][1].sheetMusicId, created[0][2], locks[0][0], audits[0][0].action, audits[0][0].entityId], ['s-main', ['c1', 'c2'], ['c1', 'c2'], 'CHALLENGE_PUBLISH', 'ch-new']);
      assert.deepEqual([notified[0][1], notified[0][2]], [['SV-1', 'SV-2', 'SV-3'], { title: 'Thử thách mới', body: 'DTR101.M1, DTR101.M2 · Thử thách Lưu thủy', link: '/community/challenges/ch-new' }]);
    });
  tc('no classes, no piece, no week', 'input={ title: "Nháp", classIds: [], publish: false }', R('{ status: "DRAFT", displayStatus: "DRAFT", startsAt: null }', 'no lock, no audit, no notification'), 'Normal', async () => {
    const { created, locks, audits, notified } = world(); const dto = await ChallengeService.create('GV-A', { title: 'Nháp', description: null, instrumentId: null, pieceId: null, classIds: [], weekStart: null, minAccuracy: null, requiredBpm: null, maxSubmissions: 3, publish: false });
    assert.deepEqual([dto.status, dto.displayStatus, dto.startsAt, created[0][1].publishedAt, locks.length, audits.length, notified.length], ['DRAFT', 'DRAFT', null, null, 0, 0, 0]);
  });
  tc('draft with weekStart 2030-01-07', 'input={ …, weekStart: "2030-01-07", publish: false }', R('{ status: "DRAFT" } stored with the full week bounds (startsAt 2030-01-06T17:00Z)'), 'Boundary', async () => { const { created } = world(); await ChallengeService.create('GV-A', publishInput({ publish: false })); assert.equal(created[0][1].startsAt.toISOString(), '2030-01-06T17:00:00.000Z'); });
  tc('N/A', 'input={ title: "", publish: false }', E(400, 'MSG-35', M.TITLE_REQUIRED, 'title'), 'Abnormal', () => { world(); return expectAppError(() => ChallengeService.create('GV-A', publishInput({ title: '', publish: false })), 400, 'MSG-35', M.TITLE_REQUIRED, 'title'); });
  tc('N/A', 'input={ …, pieceId: null, publish: true }', E(400, 'MSG-35', 'Bài nhạc không được để trống.', 'pieceId'), 'Abnormal', () => { world(); return expectAppError(() => ChallengeService.create('GV-A', publishInput({ pieceId: null })), 400, 'MSG-35', 'Bài nhạc không được để trống.', 'pieceId'); });
  tc('class c2 already has another published challenge that week', 'input={ classIds: ["c1", "c2"], weekStart: "2030-01-07", publish: true }', E(409, 'MSG-08', M.OVERLAP, undefined, 'nothing created, nobody notified'), 'Abnormal', async () => {
    const { created, notified, overlaps } = world({ overlapping: ['c2'] }); await expectAppError(() => ChallengeService.create('GV-A', publishInput()), 409, 'MSG-08', M.OVERLAP);
    assert.deepEqual([created.length, notified.length, overlaps[0][0].instrumentId, overlaps[0][0].classIds], [0, 0, 'i-tranh', ['c1', 'c2']]);
  });
  tc('class c1 empty', 'input={ …, publish: true }', E(409, 'MSG-08', M.CLASS_EMPTY), 'Abnormal', () => { world({ members: { c1: [], c2: ['SV-3'] } }); return expectAppError(() => ChallengeService.create('GV-A', publishInput()), 409, 'MSG-08', M.CLASS_EMPTY); });
  tc('repository.create throws Error("DB down"); console.error spy', 'input={ …, publish: true } / { publish: false }', E(500, 'MSG-09', M.PUBLISH_FAILED, undefined, 'console.error(error); draft → "Lưu nháp thử thách thất bại. Vui lòng thử lại."'), 'Abnormal', async () => {
    const logged = stubSync(console, 'error'); world({ createError: new Error('DB down') });
    await expectAppError(() => ChallengeService.create('GV-A', publishInput()), 500, 'MSG-09', M.PUBLISH_FAILED); await expectAppError(() => ChallengeService.create('GV-A', publishInput({ publish: false })), 500, 'MSG-09', M.DRAFT_FAILED); assert.equal(logged.length, 2);
  });
  method('update(lecturerId, challengeId, patch)');
  tc('draft ch-1 { description: null }', 'patch={ title: "Thử thách tuần 2", description: "" }', R('{ title: "Thử thách tuần 2", description: null } (empty text clears)', 'classes and piece not re-checked (not in patch)'), 'Normal', async () => {
    const { updated } = world({ stored: record() }); const pieces = stub(ChallengeRepository, 'findPieceForChallenge', () => readyPiece());
    const dto = await ChallengeService.update('GV-A', 'ch-1', { title: 'Thử thách tuần 2', description: '' }); assert.deepEqual([dto.title, updated[0][1].description, updated[0][2], pieces.length], ['Thử thách tuần 2', null, undefined, 0]);
  });
  tc('draft ch-1', 'patch={ classIds: ["c3"] } (class c3 of GV-B)', E(404, null, M.CLASS_NOT_FOUND), 'Abnormal', () => { world({ stored: record(), classes: { c3: klass('c3', { ownerId: 'GV-B' }) } }); return expectAppError(() => ChallengeService.update('GV-A', 'ch-1', { classIds: ['c3'] }), 404, null, M.CLASS_NOT_FOUND); });
  tc('ch-1 PUBLISHED', 'patch={ title: "Mới" }', E(409, 'MSG-08', M.NOT_DRAFT_EDIT), 'Abnormal', () => { world({ stored: record({ status: 'PUBLISHED' }) }); return expectAppError(() => ChallengeService.update('GV-A', 'ch-1', { title: 'Mới' }), 409, 'MSG-08', M.NOT_DRAFT_EDIT); });
  tc('draft ch-1; repository.update → false (published meanwhile)', 'patch={ title: "Mới" }', E(409, 'MSG-08', M.NOT_DRAFT_EDIT), 'Boundary', () => { world({ stored: record(), updated: false }); return expectAppError(() => ChallengeService.update('GV-A', 'ch-1', { title: 'Mới' }), 409, 'MSG-08', M.NOT_DRAFT_EDIT); });
  method('publish(lecturerId, challengeId)');
  tc('complete draft ch-1 (classes c1, c2; week 2030-01-07)', 'publish("GV-A", "ch-1")', R('{ status: "PUBLISHED", publishedAt set }', 'lockChallenge; fields re-read inside the transaction; update(…, classIds ["c1", "c2"]); notification sent'), 'Normal', async () => {
    const { updated, notified } = world({ stored: record() }); const dto = await ChallengeService.publish('GV-A', 'ch-1'); assert.deepEqual([dto.status, typeof dto.publishedAt, updated[0][2], notified.length], ['PUBLISHED', 'string', ['c1', 'c2'], 1]);
  });
  tc('draft ch-1 without piece', 'publish("GV-A", "ch-1")', E(400, 'MSG-35', 'Bài nhạc không được để trống.', 'pieceId'), 'Abnormal', () => { world({ stored: record({ pieceId: null, piece: null }) }); return expectAppError(() => ChallengeService.publish('GV-A', 'ch-1'), 400, 'MSG-35', 'Bài nhạc không được để trống.', 'pieceId'); });
  tc('ch-1 already PUBLISHED', 'publish("GV-A", "ch-1")', E(409, 'MSG-08', M.NOT_DRAFT_PUBLISH), 'Abnormal', () => { world({ stored: record({ status: 'PUBLISHED' }) }); return expectAppError(() => ChallengeService.publish('GV-A', 'ch-1'), 409, 'MSG-08', M.NOT_DRAFT_PUBLISH); });
  tc('findById → null', 'publish("GV-A", "ch-x")', E(404, null, M.NOT_FOUND), 'Abnormal', () => { world(); return expectAppError(() => ChallengeService.publish('GV-A', 'ch-x'), 404, null, M.NOT_FOUND); });
  method('remove(lecturerId, challengeId)');
  tc('draft ch-1 of GV-A', 'remove("GV-A", "ch-1")', R('undefined', 'repository.delete("ch-1") inside a transaction'), 'Normal', async () => { const { deletes } = world({ stored: record() }); assert.equal(await ChallengeService.remove('GV-A', 'ch-1'), undefined); assert.equal(deletes[0][0], 'ch-1'); });
  tc('ch-1 PUBLISHED', 'remove("GV-A", "ch-1")', E(409, 'MSG-08', M.NOT_DRAFT_DELETE), 'Abnormal', () => { world({ stored: record({ status: 'PUBLISHED' }) }); return expectAppError(() => ChallengeService.remove('GV-A', 'ch-1'), 409, 'MSG-08', M.NOT_DRAFT_DELETE); });
  tc('draft ch-1; delete → false (published meanwhile)', 'remove("GV-A", "ch-1")', E(409, 'MSG-08', M.NOT_DRAFT_DELETE), 'Boundary', () => { world({ stored: record(), deleted: false }); return expectAppError(() => ChallengeService.remove('GV-A', 'ch-1'), 409, 'MSG-08', M.NOT_DRAFT_DELETE); });
  method('ChallengeQueryService.list / get / getFormMeta / listReadyPieces');
  tc('findByLecturer → 1 draft record, total 1', 'list("GV-A", { page: 1, limit: 20 })', R('{ items: [{ id: "ch-1", displayStatus: "DRAFT", classes: [c1, c2] }], pagination: { page: 1, limit: 20, total: 1 } }'), 'Normal', async () => {
    stub(ChallengeRepository, 'findByLecturer', () => ({ records: [record()], total: 1 })); const result = await Query.list('GV-A', { page: 1, limit: 20 });
    assert.deepEqual([result.items[0].displayStatus, result.items[0].classes.map((item: any) => item.id), result.pagination], ['DRAFT', ['c1', 'c2'], { page: 1, limit: 20, total: 1 }]);
  });
  tc('challenge ch-1 of GV-B', 'get("GV-A", "ch-1")', E(404, null, M.NOT_FOUND), 'Abnormal', async () => { stub(ChallengeRepository, 'findById', () => record({ createdById: 'GV-B' })); await expectAppError(() => Query.get('GV-A', 'ch-1'), 404, null, M.NOT_FOUND); });
  tc('grading settings minAccuracy 75', 'getFormMeta()', R('{ defaultMinAccuracy: 75, maxSubmissionsDefault: 3 }'), 'Normal', async () => { stub(GradingSettingsService, 'getGradingSettings', () => ({ minAccuracy: 75, atRiskMargin: 10 })); assert.deepEqual(await Query.getFormMeta(), { defaultMinAccuracy: 75, maxSubmissionsDefault: 3 }); });
  tc('findReadyPieces → 2 pieces', 'listReadyPieces({ instrumentId: "i-tranh" })', R('{ items: [2], pagination: { page: 1, limit: 2, total: 2 } }'), 'Boundary', async () => { stub(ChallengeRepository, 'findReadyPieces', () => [{ id: 'p1' }, { id: 'p2' }]); assert.deepEqual((await Query.listReadyPieces({ instrumentId: 'i-tranh' })).pagination, { page: 1, limit: 2, total: 2 }); });

}
// ----------------------------------------------------------------------
// Part 2: cases added with the boundary / decision-table review
// ----------------------------------------------------------------------
{

  const { R, expectAppError, method, sheet, setValue, stub, tc } = UnitTestKit;
  const ChallengeService: any = ChallengeServiceClass;
  const Reference: any = ChallengeReferenceServiceClass;
  const ChallengeDTO: any = ChallengeDTOClass;
  const ChallengeRepository: any = ChallengeRepositoryClass;
  const MemberRepository: any = MemberRepositoryClass;
  const NotificationService: any = NotificationServiceClass;
  const AuditLogger: any = AuditLoggerClass;
  const PrismaClientProvider: any = PrismaClientProviderClass;

  const M = {
    NOT_FOUND: 'Không tìm thấy thử thách.', TITLE_REQUIRED: 'Tiêu đề không được để trống.', NOT_DRAFT_EDIT: 'Không thể sửa thử thách vì thử thách đã được đăng.',
    NOT_DRAFT_PUBLISH: 'Không thể đăng thử thách vì thử thách đã được đăng.', NOT_MONDAY: 'Không thể đăng thử thách vì tuần phải bắt đầu vào thứ Hai.',
    PAST_WEEK: 'Không thể đăng thử thách vì không thể chọn tuần đã kết thúc.', CLASS_NOT_FOUND: 'Không tìm thấy lớp học.',
    OVERLAP: 'Không thể đăng thử thách vì lớp đã có thử thách khác trong tuần này.', PUBLISH_FAILED: 'Đăng thử thách thất bại. Vui lòng thử lại.',
    DRAFT_FAILED: 'Lưu nháp thử thách thất bại. Vui lòng thử lại.'
  };
  const MONDAY = '2030-01-07';
  const TX: any = { tx: true };
  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'ch-1', title: 'Thử thách Lưu thủy', description: 'Mô tả cũ', status: 'DRAFT', createdById: 'GV-A', instrumentId: 'i-tranh', pieceId: 'p1',
    instrument: { id: 'i-tranh', name: 'Đàn tranh' }, piece: { id: 'p1', title: 'Lưu thủy' }, classes: [{ class: { id: 'c1', name: 'DTR101.M1' } }, { class: { id: 'c2', name: 'DTR101.M2' } }],
    startsAt: new Date('2030-01-06T17:00:00Z'), endsAt: new Date('2030-01-13T16:59:59.999Z'), minAccuracy: 70, requiredBpm: 80, maxSubmissions: 3, publishedAt: null,
    createdAt: new Date('2026-11-01T03:00:00Z'), updatedAt: new Date('2026-11-02T03:00:00Z'), ...overrides
  });
  const fieldsOf = (overrides: Record<string, unknown> = {}) => ({ ...ChallengeService.toFields(record()), ...overrides });
  const klass = (id: string, overrides: Record<string, unknown> = {}) => ({ id, name: id === 'c1' ? 'DTR101.M1' : 'DTR101.M2', ownerId: 'GV-A', status: 'ACTIVE', instrumentId: 'i-tranh', coLecturers: [], ...overrides });
  const readyPiece = () => ({ id: 'p1', visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null, instruments: [{ instrumentId: 'i-tranh' }], sheetMusic: [{ id: 's-main', visibility: 'PUBLIC', moderation: 'NORMAL', referenceAudioId: 'a1', analysisStatus: 'READY' }] });
  const plan = (overrides: Record<string, unknown> = {}) => ({ challengeId: null, fields: fieldsOf(), classIds: undefined, publish: false, reloadFields: false, ...overrides });
  const currentMonday = (): string => DateTimeUtil.startOfWeekInVietnam(DateTimeUtil.todayInVietnam(new Date()));

  const world = (options: { stored?: any; members?: Record<string, string[]>; overlapping?: string[]; classes?: Record<string, unknown>; updated?: boolean } = {}) => {
    const stored: any = options.stored ?? null;
    setValue(PrismaClientProvider, 'instance', { $transaction: async (work: (client: unknown) => unknown) => work(TX) });
    const created = stub(ChallengeRepository, 'create', (_lecturer: string, data: any) => { void data; return { id: 'ch-new' }; });
    const updated = stub(ChallengeRepository, 'update', () => options.updated !== false);
    stub(ChallengeRepository, 'findById', () => stored);
    const lockChallenge = stub(ChallengeRepository, 'lockChallenge');
    const lockClasses = stub(ChallengeRepository, 'lockClasses');
    stub(ChallengeRepository, 'findClassForChallenge', (id: string) => (options.classes && id in options.classes ? options.classes[id] : klass(id)));
    stub(ChallengeRepository, 'findPieceForChallenge', () => readyPiece());
    const overlaps = stub(ChallengeRepository, 'findOverlappingClassIds', () => options.overlapping ?? []);
    const members = options.members ?? { c1: ['SV-1', 'SV-2'], c2: ['SV-2', 'SV-3'] };
    const lookups = stub(MemberRepository, 'findActiveMemberIds', (classId: string) => new Set(members[classId] ?? []));
    const notified = stub(NotificationService, 'notifyUsers', () => 0);
    const audits = stub(AuditLogger, 'record');
    return { created, updated, lockChallenge, lockClasses, overlaps, lookups, notified, audits };
  };
  const fail = async (action: () => unknown): Promise<any> => {
    try { await action(); } catch (error) { return error; }
    throw new Error('Expected an error but nothing was thrown');
  };

  sheet('ChallengeService', 'CH', 'tests/unit/ChallengeServiceInternals.test.ts', 50);

  // ---------------------------------------------------------------- ChallengeDTO.toDTO
  method('ChallengeDTO.toDTO(record, now)');
  tc('published challenge GV-A, week 2030-01-07 (2030-01-06T17:00Z → 2030-01-13T16:59:59.999Z)', '[EP] toDTO(record PUBLISHED, now = 2030-01-10)', R('full DTO: ISO strings, classes flattened to class objects, weekStart "2030-01-07", displayStatus "ACTIVE"'), 'Normal', () => {
    const dto = ChallengeDTO.toDTO(record({ status: 'PUBLISHED', publishedAt: new Date('2030-01-01T03:00:00Z') }), new Date('2030-01-10T00:00:00Z'));
    assert.deepEqual(dto, {
      id: 'ch-1', title: 'Thử thách Lưu thủy', description: 'Mô tả cũ', status: 'PUBLISHED', displayStatus: 'ACTIVE', instrument: { id: 'i-tranh', name: 'Đàn tranh' }, piece: { id: 'p1', title: 'Lưu thủy' },
      classes: [{ id: 'c1', name: 'DTR101.M1' }, { id: 'c2', name: 'DTR101.M2' }], weekStart: MONDAY, startsAt: '2030-01-06T17:00:00.000Z', endsAt: '2030-01-13T16:59:59.999Z',
      minAccuracy: 70, requiredBpm: 80, maxSubmissions: 3, publishedAt: '2030-01-01T03:00:00.000Z', createdAt: '2026-11-01T03:00:00.000Z', updatedAt: '2026-11-02T03:00:00.000Z'
    });
  });
  tc('draft with no week', '[DT] toDTO(record status DRAFT, startsAt = null, endsAt = null)', R('displayStatus "DRAFT"; weekStart, startsAt, endsAt and publishedAt are all null'), 'Normal', () => {
    const dto = ChallengeDTO.toDTO(record({ startsAt: null, endsAt: null }), new Date());
    assert.deepEqual([dto.displayStatus, dto.weekStart, dto.startsAt, dto.endsAt, dto.publishedAt], ['DRAFT', null, null, null, null]);
  });
  tc('published, window 2030-01-06T17:00Z → 2030-01-13T16:59:59.999Z', '[EP] toDTO(published record, now = before / inside / after the window)', R('"UPCOMING" / "ACTIVE" / "ENDED" (the now parameter is used)'), 'Normal', () => {
    const published = record({ status: 'PUBLISHED' });
    const status = (now: string) => ChallengeDTO.toDTO(published, new Date(now)).displayStatus;
    assert.deepEqual([status('2030-01-01T00:00:00Z'), status('2030-01-10T00:00:00Z'), status('2030-02-01T00:00:00Z')], ['UPCOMING', 'ACTIVE', 'ENDED']);
  });
  tc('N/A', '[EP] toDTO(record with classes = [])', R('classes []'), 'Boundary', () => assert.deepEqual(ChallengeDTO.toDTO(record({ classes: [] }), new Date()).classes, []));
  tc('N/A', '[BVA] toDTO(record with piece = null and instrument = null)', R('piece null and instrument null are passed through, no throw'), 'Boundary', () => {
    const dto = ChallengeDTO.toDTO(record({ piece: null, instrument: null }), new Date());
    assert.deepEqual([dto.piece, dto.instrument], [null, null]);
  });

  // ---------------------------------------------------------------- ChallengeDTO.weekStartOf
  method('ChallengeDTO.weekStartOf(startsAt)');
  tc('N/A', '[BVA] startsAt = 2030-01-06T17:00:00Z (Monday 00:00 UTC+7)', R('"2030-01-07" (that Monday)'), 'Boundary', () => assert.equal(ChallengeDTO.weekStartOf(new Date('2030-01-06T17:00:00Z')), MONDAY));
  tc('N/A', '[BVA] startsAt = 2030-01-06T16:59:59.999Z (Sunday 23:59:59.999 UTC+7)', R('"2029-12-31" (still the previous week, 1 ms before Monday)'), 'Boundary', () => assert.equal(ChallengeDTO.weekStartOf(new Date('2030-01-06T16:59:59.999Z')), '2029-12-31'));
  tc('N/A', '[EP] startsAt = 2030-01-13T05:00Z (Sunday 12:00 UTC+7)', R('"2030-01-07" (Monday of the same week)'), 'Normal', () => assert.equal(ChallengeDTO.weekStartOf(new Date('2030-01-13T05:00:00Z')), MONDAY));
  tc('N/A', '[EP] startsAt = 2030-01-09T05:00Z (Wednesday noon, a "now" start of the current week)', R('"2030-01-07"'), 'Normal', () => assert.equal(ChallengeDTO.weekStartOf(new Date('2030-01-09T05:00:00Z')), MONDAY));
  tc('N/A', '[BVA] week crossing New Year: Sunday 2030-01-06 12:00 UTC+7 / Monday 2029-12-31 00:00 UTC+7', R('"2029-12-31" for both'), 'Boundary', () => {
    assert.deepEqual([ChallengeDTO.weekStartOf(new Date('2030-01-06T05:00:00Z')), ChallengeDTO.weekStartOf(new Date('2029-12-30T17:00:00Z'))], ['2029-12-31', '2029-12-31']);
  });
  tc('N/A', '[BVA] startsAt = 2030-01-13T20:00Z (UTC date is Sunday, Vietnam date is Monday 03:00)', R('"2030-01-14" (Vietnam date decides, next Monday)'), 'Boundary', () => assert.equal(ChallengeDTO.weekStartOf(new Date('2030-01-13T20:00:00Z')), '2030-01-14'));

  // ---------------------------------------------------------------- toFields
  method('ChallengeService.toFields(record)');
  tc('draft record ch-1', '[EP] toFields(full record)', R('{ title, description, instrumentId, pieceId, classIds ["c1", "c2"], weekStart "2030-01-07", minAccuracy 70, requiredBpm 80, maxSubmissions 3 }'), 'Normal', () => {
    assert.deepEqual(ChallengeService.toFields(record()), { title: 'Thử thách Lưu thủy', description: 'Mô tả cũ', instrumentId: 'i-tranh', pieceId: 'p1', classIds: ['c1', 'c2'], weekStart: MONDAY, minAccuracy: 70, requiredBpm: 80, maxSubmissions: 3 });
  });
  tc('draft without a week', '[DT] toFields(record with startsAt = null)', R('weekStart null'), 'Normal', () => assert.equal(ChallengeService.toFields(record({ startsAt: null })).weekStart, null));
  tc('N/A', '[BVA] toFields(record with classes = [])', R('classIds []'), 'Boundary', () => assert.deepEqual(ChallengeService.toFields(record({ classes: [] })).classIds, []));
  tc('N/A', '[EP] toFields(record with description, minAccuracy and requiredBpm = null)', R('the three fields stay null'), 'Normal', () => {
    const fields = ChallengeService.toFields(record({ description: null, minAccuracy: null, requiredBpm: null }));
    assert.deepEqual([fields.description, fields.minAccuracy, fields.requiredBpm], [null, null, null]);
  });
  tc('N/A', '[EP] toFields(record): keys of the returned object', R('9 editable fields only; no "publish" key'), 'Normal', () => {
    assert.deepEqual(Object.keys(ChallengeService.toFields(record())).sort(), ['classIds', 'description', 'instrumentId', 'maxSubmissions', 'minAccuracy', 'pieceId', 'requiredBpm', 'title', 'weekStart']);
  });

  // ---------------------------------------------------------------- mergePatch
  method('ChallengeService.mergePatch(current, patch)');
  const current = () => ChallengeService.toFields(record());
  const merge = (patch: Record<string, unknown>) => ChallengeService.mergePatch(current(), patch);
  tc('current = fields of ch-1', '[BVA] mergePatch(current, {})', R('every field equals current; a new object is returned'), 'Boundary', () => {
    const merged = merge({});
    assert.deepEqual(merged, current());
    assert.notEqual(merged, current());
  });
  tc('current title "Thử thách Lưu thủy"', '[EP] patch { title: "Tuần mới" }', R('title replaced; other fields unchanged'), 'Normal', () => assert.deepEqual(merge({ title: 'Tuần mới' }), { ...current(), title: 'Tuần mới' }));
  tc('current description "Mô tả cũ"', '[DT] patch { description: "" }', R('description null (empty text clears)'), 'Normal', () => assert.equal(merge({ description: '' }).description, null));
  tc('current description "Mô tả cũ"', '[DT] patch { description: null }', R('description null'), 'Normal', () => assert.equal(merge({ description: null }).description, null));
  tc('current description "Mô tả cũ"', '[DT] patch { description: undefined } / patch without the key', R('description keeps "Mô tả cũ"'), 'Normal', () => assert.equal(merge({ description: undefined }).description, 'Mô tả cũ'));
  tc('current description "Mô tả cũ"', '[EP] patch { description: "Mô tả mới" }', R('description "Mô tả mới"'), 'Normal', () => assert.equal(merge({ description: 'Mô tả mới' }).description, 'Mô tả mới'));
  tc('current instrumentId "i-tranh"', '[DT] patch { instrumentId: null }', R('instrumentId null (cleared)'), 'Normal', () => assert.equal(merge({ instrumentId: null }).instrumentId, null));
  tc('current instrumentId "i-tranh"', '[DT] patch { instrumentId: undefined }', R('instrumentId keeps "i-tranh"'), 'Normal', () => assert.equal(merge({ instrumentId: undefined }).instrumentId, 'i-tranh'));
  tc('current pieceId "p1"', '[DT] patch { pieceId: null } / { pieceId: undefined } / { pieceId: "p2" }', R('null (cleared) / "p1" (kept) / "p2" (replaced)'), 'Normal', () => {
    assert.deepEqual([merge({ pieceId: null }).pieceId, merge({ pieceId: undefined }).pieceId, merge({ pieceId: 'p2' }).pieceId], [null, 'p1', 'p2']);
  });
  tc('current classIds ["c1", "c2"]', '[DT] patch { classIds: [] }', R('classIds [] (an empty array is not nullish, so it replaces)'), 'Boundary', () => assert.deepEqual(merge({ classIds: [] }).classIds, []));
  tc('current classIds ["c1", "c2"]', '[DT] patch { classIds: undefined }', R('classIds keeps ["c1", "c2"]'), 'Normal', () => assert.deepEqual(merge({ classIds: undefined }).classIds, ['c1', 'c2']));
  tc('current weekStart "2030-01-07"', '[DT] patch { weekStart: null }', R('weekStart null (cleared)'), 'Normal', () => assert.equal(merge({ weekStart: null }).weekStart, null));
  tc('current minAccuracy 70', '[BVA] patch { minAccuracy: 0 }', R('minAccuracy 0 (zero is a value, not "missing")'), 'Boundary', () => assert.equal(merge({ minAccuracy: 0 }).minAccuracy, 0));
  tc('current minAccuracy 70', '[DT] patch { minAccuracy: null }', R('minAccuracy null (cleared)'), 'Normal', () => assert.equal(merge({ minAccuracy: null }).minAccuracy, null));
  tc('current requiredBpm 80', '[BVA] patch { requiredBpm: 0 } / { requiredBpm: null }', R('0 / null'), 'Boundary', () => assert.deepEqual([merge({ requiredBpm: 0 }).requiredBpm, merge({ requiredBpm: null }).requiredBpm], [0, null]));
  tc('current maxSubmissions 3', '[DT] patch { maxSubmissions: null }', R('maxSubmissions keeps 3 (?? rule: null cannot clear this field). Confirm this is intended'), 'Boundary', () => assert.equal(merge({ maxSubmissions: null }).maxSubmissions, 3));
  tc('current maxSubmissions 3', '[BVA] patch { maxSubmissions: 0 }', R('maxSubmissions 0 here; it is rejected later by assertValid on publish'), 'Boundary', () => assert.equal(merge({ maxSubmissions: 0 }).maxSubmissions, 0));
  tc('N/A', '[EG] patch with an unknown key { foo: 1 }', R('ignored: result equals current'), 'Abnormal', () => assert.deepEqual(merge({ foo: 1 }), current()));

  // ---------------------------------------------------------------- assertValid
  method('ChallengeService.assertValid(fields, isPublishing)');
  tc('N/A', '[EP] assertValid(complete fields, false)', R('undefined, no throw'), 'Normal', () => assert.equal(ChallengeService.assertValid(fieldsOf(), false), undefined));
  tc('N/A', '[EP] assertValid({ title: "" , … }, false)', 'Return: N/A\nException: AppError(statusCode=400, code="MSG-35", field="title") – "Tiêu đề không được để trống."; fieldErrors has 1 item\nLog Message: N/A', 'Abnormal', async () => {
    const error = await fail(() => ChallengeService.assertValid(fieldsOf({ title: '' }), false));
    assert.deepEqual([error.statusCode, error.code, error.field, error.message, error.fieldErrors.length], [400, 'MSG-35', 'title', M.TITLE_REQUIRED, 1]);
  });
  tc('N/A', '[BVA] assertValid({ requiredBpm: 999, … }, false)', R('no throw (a draft skips the range rules)'), 'Boundary', () => assert.equal(ChallengeService.assertValid(fieldsOf({ requiredBpm: 999 }), false), undefined));
  tc('N/A', '[EP] assertValid(complete fields, true)', R('undefined, no throw'), 'Normal', () => assert.equal(ChallengeService.assertValid(fieldsOf(), true), undefined));
  tc('N/A', '[DT] assertValid({ instrumentId: null, pieceId: null, weekStart: null, … }, true)', 'Return: N/A\nException: AppError(statusCode=400, code="MSG-35", field="instrumentId") – the first error is reported; fieldErrors lists instrumentId, pieceId, weekStart in rule order\nLog Message: N/A', 'Abnormal', async () => {
    const error = await fail(() => ChallengeService.assertValid(fieldsOf({ instrumentId: null, pieceId: null, weekStart: null }), true));
    assert.deepEqual([error.statusCode, error.code, error.field, error.fieldErrors.map((item: any) => item.field)], [400, 'MSG-35', 'instrumentId', ['instrumentId', 'pieceId', 'weekStart']]);
  });
  tc('N/A', '[BVA] assertValid({ title: 101 characters, … }, true)', 'Return: N/A\nException: AppError(statusCode=400, code="MSG-37", field="title")\nLog Message: N/A', 'Boundary', async () => {
    const error = await fail(() => ChallengeService.assertValid(fieldsOf({ title: 'a'.repeat(101) }), true));
    assert.deepEqual([error.statusCode, error.code, error.field], [400, 'MSG-37', 'title']);
  });

  // ---------------------------------------------------------------- buildPlan
  method('ChallengeService.buildPlan(lecturerId, challengeId, fields, classIds, publish, checks)');
  const planWorld = () => {
    const order: string[] = [];
    const classChecks = stub(Reference, 'assertClasses', () => { order.push('classes'); return []; });
    const pieceChecks = stub(Reference, 'assertPiece', () => { order.push('piece'); return null; });
    return { order, classChecks, pieceChecks };
  };
  tc('assertClasses / assertPiece stubbed', '[DT] buildPlan("GV-A", null, fields, ["c1","c2"], publish = true, { checkClasses: true, checkPiece: true })', R('no class or piece lookup (a publish repeats them inside its transaction); plan.publish true, reloadFields false'), 'Normal', async () => {
    const { classChecks, pieceChecks } = planWorld();
    const result = await ChallengeService.buildPlan('GV-A', null, fieldsOf(), ['c1', 'c2'], true, { checkClasses: true, checkPiece: true });
    assert.deepEqual([classChecks.length, pieceChecks.length, result.publish, result.reloadFields], [0, 0, true, false]);
  });
  tc('assertClasses / assertPiece stubbed', '[DT] buildPlan(…, publish = false, { checkClasses: false, checkPiece: false })', R('no lookups'), 'Normal', async () => {
    const { classChecks, pieceChecks } = planWorld();
    await ChallengeService.buildPlan('GV-A', null, fieldsOf(), undefined, false, { checkClasses: false, checkPiece: false });
    assert.deepEqual([classChecks.length, pieceChecks.length], [0, 0]);
  });
  tc('assertClasses / assertPiece stubbed', '[DT] buildPlan(…, publish = false, { checkClasses: true, checkPiece: false })', R('assertClasses(["c1","c2"], "i-tranh", "GV-A", { requireStudents: false }) once; assertPiece not called'), 'Normal', async () => {
    const { classChecks, pieceChecks } = planWorld();
    await ChallengeService.buildPlan('GV-A', null, fieldsOf(), undefined, false, { checkClasses: true, checkPiece: false });
    assert.deepEqual([classChecks.length, classChecks[0], pieceChecks.length], [1, [['c1', 'c2'], 'i-tranh', 'GV-A', { requireStudents: false }], 0]);
  });
  tc('assertClasses / assertPiece stubbed', '[DT] buildPlan(…, publish = false, { checkClasses: false, checkPiece: true })', R('assertPiece("p1", "i-tranh", { requireReady: false }) once; assertClasses not called'), 'Normal', async () => {
    const { classChecks, pieceChecks } = planWorld();
    await ChallengeService.buildPlan('GV-A', null, fieldsOf(), undefined, false, { checkClasses: false, checkPiece: true });
    assert.deepEqual([classChecks.length, pieceChecks.length, pieceChecks[0]], [0, 1, ['p1', 'i-tranh', { requireReady: false }]]);
  });
  tc('assertClasses / assertPiece stubbed', '[DT] buildPlan(…, publish = false, { checkClasses: true, checkPiece: true })', R('both checked, classes first then piece'), 'Normal', async () => {
    const { order } = planWorld();
    await ChallengeService.buildPlan('GV-A', null, fieldsOf(), undefined, false, { checkClasses: true, checkPiece: true });
    assert.deepEqual(order, ['classes', 'piece']);
  });
  tc('assertClasses stubbed', '[EP] buildPlan(…, fields.weekStart = "2030-01-08" (a Tuesday), checkClasses true)', 'Return: N/A\nException: AppError(statusCode=400, code="MSG-08", field="weekStart") – "Không thể đăng thử thách vì tuần phải bắt đầu vào thứ Hai."; no class lookup\nLog Message: N/A', 'Abnormal', async () => {
    const { classChecks } = planWorld();
    await expectAppError(() => ChallengeService.buildPlan('GV-A', null, fieldsOf({ weekStart: '2030-01-08' }), undefined, false, { checkClasses: true, checkPiece: true }), 400, 'MSG-08', M.NOT_MONDAY, 'weekStart');
    assert.equal(classChecks.length, 0);
  });
  tc('N/A', '[EP] buildPlan("GV-A", "ch-1", fields, undefined, false, …)', R('plan echoes challengeId "ch-1", fields and classIds (undefined stays undefined), publish false'), 'Normal', async () => {
    planWorld();
    const fields = fieldsOf();
    const result = await ChallengeService.buildPlan('GV-A', 'ch-1', fields, undefined, false, { checkClasses: false, checkPiece: false });
    assert.deepEqual(result, { challengeId: 'ch-1', fields, classIds: undefined, publish: false, reloadFields: false });
  });

  // ---------------------------------------------------------------- save
  method('ChallengeService.save(lecturerId, plan)');
  tc('persist stubbed → "ch-1"; findById → record ch-1', '[EP] save("GV-A", plan { challengeId "ch-1", publish false })', R('DTO of the stored record (id "ch-1"); persist received ("GV-A", plan, the transaction client)'), 'Normal', async () => {
    world({ stored: record() });
    const persists = stub(ChallengeService, 'persist', () => 'ch-1');
    const draft = plan({ challengeId: 'ch-1' });
    const dto = await ChallengeService.save('GV-A', draft);
    assert.deepEqual([dto.id, persists[0][0], persists[0][1] === draft, persists[0][2]], ['ch-1', 'GV-A', true, TX]);
  });
  tc('persist stubbed → "ch-1"; findById → null', '[EG] save("GV-A", plan)', 'Return: N/A\nException: AppError(statusCode=404) – "Không tìm thấy thử thách."\nLog Message: N/A', 'Abnormal', async () => {
    world({ stored: null });
    stub(ChallengeService, 'persist', () => 'ch-1');
    await expectAppError(() => ChallengeService.save('GV-A', plan()), 404, null, M.NOT_FOUND);
  });

  // ---------------------------------------------------------------- persist
  method('ChallengeService.persist(lecturerId, plan, transaction)');
  const persist = (planInput: Record<string, unknown>) => ChallengeService.persist('GV-A', planInput, TX);
  const publishPlan = (overrides: Record<string, unknown> = {}) => plan({ publish: true, fields: fieldsOf({ weekStart: MONDAY }), ...overrides });
  tc('draft ch-1 stored', '[DT] persist("GV-A", plan { challengeId "ch-1", classIds ["c1"], publish false })', R('update called with classIds ["c1"]'), 'Normal', async () => {
    const { updated } = world({ stored: record() });
    await persist(plan({ challengeId: 'ch-1', classIds: ['c1'] }));
    assert.deepEqual(updated[0][2], ['c1']);
  });
  tc('weekStart = this week\'s Monday (computed at run time)', '[BVA] persist("GV-A", plan { publish true, weekStart = current week })', R('startsAt = now (the current week starts immediately); endsAt = Sunday 23:59:59.999 UTC+7'), 'Boundary', async () => {
    const { created } = world();
    const before = Date.now();
    await persist(publishPlan({ fields: fieldsOf({ weekStart: currentMonday() }) }));
    const after = Date.now();
    const { startsAt, endsAt } = created[0][1];
    assert.equal(startsAt.getTime() >= before && startsAt.getTime() <= after, true);
    assert.equal(endsAt.getTime(), DateTimeUtil.startOfDayInVietnam(DateTimeUtil.addDays(currentMonday(), 7)).getTime() - 1);
  });
  tc('findById → null', '[DT] persist("GV-A", plan { challengeId "ch-1", publish true })', 'Return: N/A\nException: AppError(statusCode=404) – "Không tìm thấy thử thách."\nLog Message: lockChallenge("ch-1") was called first', 'Abnormal', async () => {
    const { lockChallenge } = world({ stored: null });
    await expectAppError(() => persist(publishPlan({ challengeId: 'ch-1' })), 404, null, M.NOT_FOUND);
    assert.equal(lockChallenge.length, 1);
  });
  tc('ch-1 created by GV-B', '[DT] persist("GV-A", plan { challengeId "ch-1", publish true })', 'Return: N/A\nException: AppError(statusCode=404) – "Không tìm thấy thử thách." (existence not leaked)\nLog Message: N/A', 'Abnormal', async () => {
    world({ stored: record({ createdById: 'GV-B' }) });
    await expectAppError(() => persist(publishPlan({ challengeId: 'ch-1' })), 404, null, M.NOT_FOUND);
  });
  tc('ch-1 already PUBLISHED', '[DT] persist("GV-A", plan { challengeId "ch-1", publish true })', 'Return: N/A\nException: AppError(statusCode=409, code="MSG-08") – "Không thể đăng thử thách vì thử thách đã được đăng."\nLog Message: N/A', 'Abnormal', async () => {
    world({ stored: record({ status: 'PUBLISHED' }) });
    await expectAppError(() => persist(publishPlan({ challengeId: 'ch-1' })), 409, 'MSG-08', M.NOT_DRAFT_PUBLISH);
  });
  tc('stored title differs from plan.fields.title', '[DT] persist("GV-A", plan { challengeId "ch-1", publish true, reloadFields true }) with stored title "Tiêu đề đã lưu" / stored title ""', R('stored fields win: update receives title "Tiêu đề đã lưu"; an invalid stored title "" → AppError 400 MSG-35 field title'), 'Normal', async () => {
    const { updated } = world({ stored: record({ title: 'Tiêu đề đã lưu' }) });
    await persist(publishPlan({ challengeId: 'ch-1', reloadFields: true, fields: fieldsOf({ title: 'Tiêu đề của plan' }) }));
    assert.equal(updated[0][1].title, 'Tiêu đề đã lưu');
    world({ stored: record({ title: '' }) });
    await expectAppError(() => persist(publishPlan({ challengeId: 'ch-1', reloadFields: true })), 400, 'MSG-35', M.TITLE_REQUIRED, 'title');
  });
  tc('stored title differs from plan.fields.title', '[DT] persist("GV-A", plan { challengeId "ch-1", publish true, reloadFields false })', R('plan.fields are used: update receives title "Tiêu đề của plan"'), 'Normal', async () => {
    const { updated } = world({ stored: record({ title: 'Tiêu đề đã lưu' }) });
    await persist(publishPlan({ challengeId: 'ch-1', reloadFields: false, fields: fieldsOf({ title: 'Tiêu đề của plan' }) }));
    assert.equal(updated[0][1].title, 'Tiêu đề của plan');
  });
  tc('class c2 already has another published challenge that week', '[DT] persist("GV-A", plan { challengeId "ch-1", publish true })', 'Return: N/A\nException: AppError(statusCode=409, code="MSG-08") – "Không thể đăng thử thách vì lớp đã có thử thách khác trong tuần này."\nLog Message: findOverlappingClassIds called with excludeChallengeId "ch-1"; nothing written', 'Abnormal', async () => {
    const { overlaps, updated, created, audits } = world({ stored: record(), overlapping: ['c2'] });
    await expectAppError(() => persist(publishPlan({ challengeId: 'ch-1' })), 409, 'MSG-08', M.OVERLAP);
    assert.deepEqual([overlaps[0][0].excludeChallengeId, updated.length, created.length, audits.length], ['ch-1', 0, 0, 0]);
  });
  tc('fields.instrumentId = null (cannot pass validation in practice)', '[BVA] persist("GV-A", plan { publish true, fields.instrumentId null, pieceId null })', R('overlap query skipped; create called with instrumentId null'), 'Boundary', async () => {
    const { overlaps, created } = world();
    await persist(publishPlan({ fields: fieldsOf({ weekStart: MONDAY, instrumentId: null, pieceId: null }) }));
    assert.deepEqual([overlaps.length, created[0][1].instrumentId], [0, null]);
  });
  tc('ch-1 stored; plan.classIds undefined', '[EP] persist("GV-A", plan { challengeId "ch-1", publish true, classIds undefined })', R('update(…, classIds) receives fields.classIds ["c1","c2"]'), 'Normal', async () => {
    const { updated } = world({ stored: record() });
    await persist(publishPlan({ challengeId: 'ch-1', classIds: undefined }));
    assert.deepEqual(updated[0][2], ['c1', 'c2']);
  });
  tc('ch-1 stored; repository.update → false', '[EP] persist("GV-A", plan { challengeId "ch-1", publish true })', 'Return: N/A\nException: AppError(statusCode=409, code="MSG-08") – "Không thể đăng thử thách vì thử thách đã được đăng."\nLog Message: N/A', 'Abnormal', async () => {
    world({ stored: record(), updated: false });
    await expectAppError(() => persist(publishPlan({ challengeId: 'ch-1' })), 409, 'MSG-08', M.NOT_DRAFT_PUBLISH);
  });
  tc('recordPublish stubbed', '[EP] persist("GV-A", plan { challengeId "ch-1", publish true })', R('"ch-1"; recordPublish called once with ("GV-A", "ch-1", fields, ["DTR101.M1","DTR101.M2"], the same transaction)'), 'Normal', async () => {
    world({ stored: record() });
    const recorded = stub(ChallengeService, 'recordPublish');
    assert.equal(await persist(publishPlan({ challengeId: 'ch-1' })), 'ch-1');
    assert.deepEqual([recorded.length, recorded[0][0], recorded[0][1], recorded[0][3], recorded[0][4]], [1, 'GV-A', 'ch-1', ['DTR101.M1', 'DTR101.M2'], TX]);
  });
  tc('new challenge', '[EP] persist("GV-A", plan { challengeId null, publish true })', R('create data.status "PUBLISHED" and publishedAt = now'), 'Normal', async () => {
    const { created } = world();
    const before = Date.now();
    await persist(publishPlan());
    const data = created[0][1];
    assert.deepEqual([data.status, data.publishedAt instanceof Date && data.publishedAt.getTime() >= before], ['PUBLISHED', true]);
  });

  // ---------------------------------------------------------------- recordPublish
  method('ChallengeService.recordPublish(lecturerId, challengeId, fields, classNames, transaction)');
  const record1 = (overrides: Record<string, unknown> = {}, classNames = ['DTR101.M1']) => ChallengeService.recordPublish('GV-A', 'ch-9', fieldsOf(overrides), classNames, TX);
  tc('class c1 with active members SV-1, SV-2', '[EP] recordPublish("GV-A", "ch-9", fields { classIds ["c1"] }, ["DTR101.M1"], tx)', R('audit record { actorId "GV-A", action CHALLENGE_PUBLISH, entityId "ch-9", payload { instrumentId, pieceId, classIds, weekStart } }; notifyUsers receives ["SV-1","SV-2"]'), 'Normal', async () => {
    const { audits, notified } = world();
    await record1({ classIds: ['c1'] });
    assert.deepEqual(audits[0][0], {
      actorId: 'GV-A', action: ChallengeConstant.auditActions.CHALLENGE_PUBLISH, entityType: ChallengeConstant.auditEntityType, entityId: 'ch-9',
      payload: { instrumentId: 'i-tranh', pieceId: 'p1', classIds: ['c1'], weekStart: MONDAY }
    });
    assert.deepEqual([notified.length, notified[0][0], notified[0][1]], [1, 'GV-A', ['SV-1', 'SV-2']]);
  });
  tc('class c1 has no active member', '[BVA] recordPublish(…, fields { classIds ["c1"] }, …)', R('audit still recorded; notifyUsers called once with [] (documents current behaviour)'), 'Boundary', async () => {
    const { audits, notified } = world({ members: { c1: [] } });
    await record1({ classIds: ['c1'] });
    assert.deepEqual([audits.length, notified.length, notified[0][1]], [1, 1, []]);
  });
  tc('transaction client "tx"', '[EP] recordPublish("GV-A", "ch-9", fields { classIds ["c1","c2"] }, …, tx)', R('the same transaction is passed to AuditLogger.record, to each member lookup and to notifyUsers'), 'Normal', async () => {
    const { audits, lookups, notified } = world();
    await record1({ classIds: ['c1', 'c2'] }, ['DTR101.M1', 'DTR101.M2']);
    assert.deepEqual([audits[0][1] === TX, lookups.map((call) => call[1] === TX), notified[0][3] === TX], [true, [true, true], true]);
  });

}
