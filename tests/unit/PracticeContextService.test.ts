/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/PracticeContextService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import PracticeContextServiceClass from '../../src/modules/practice/service/PracticeContextService.ts';
import PracticeSettingsServiceClass from '../../src/modules/practice/service/PracticeSettingsService.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { E, R, expectAppError, method, sheet, tc } = UnitTestKit;
  const PracticeContextService: any = PracticeContextServiceClass;
  const PracticeSettingsService: any = PracticeSettingsServiceClass;

  const SHEET_NOT_FOUND = 'Không tìm thấy bản nhạc đã chọn của bài này.';
  const now = new Date('2026-11-07T03:00:00Z');
  const contextSheet = (overrides: Record<string, unknown> = {}) => ({
    id: 's-tranh', pieceId: 'p1', instrumentId: 'i-tranh', kind: 'MAIN', name: 'Bản chính', durationSec: 6, analysisFileUrl: 'http://rhythm/a.json',
    piece: { id: 'p1', title: 'Lý ngựa ô' }, instrument: { id: 'i-tranh', name: 'Đàn tranh' }, level: { id: 'l-coban', name: 'Cơ bản' },
    referenceAudio: { storageKey: 'audio/2026-11/a1.wav', status: 'READY' }, ...overrides
  });
  const candidate = (overrides: Record<string, unknown> = {}) => ({ id: 'as1', title: 'Tuần 4', description: 'Luyện đoạn A', status: 'PUBLISHED', deadline: new Date('2026-12-27T16:59:00Z'), maxSubmissions: 3, targetBpm: 72, currentVersionId: 'v1', currentVersion: { kind: 'SOLO' }, submissions: [{ status: 'COMPLETED' }], ...overrides });
  const enrollment = (assignments = [candidate()]) => ({ classRecord: { id: 'c1', name: 'DTR101.M1', status: 'ACTIVE', instrumentId: 'i-tranh' }, memberInstrumentId: 'i-tranh', assignments });
  const repo = (options: { sheet?: unknown; enrollments?: unknown[]; mainAudio?: unknown } = {}) => ({
    findContextSheet: async () => (options.sheet !== undefined ? options.sheet : contextSheet()), findClassAssignments: async () => options.enrollments ?? [enrollment()],
    findMainReferenceAudio: async () => options.mainAudio ?? null,
    findInstrumentTunes: async () => [{ id: 't1', tuneName: 'Rê 4', pitch: 293.66, displayOrder: 1 }, { id: 't2', tuneName: 'Sol 4', pitch: 392, displayOrder: 2 }]
  });
  const context = (options = {}) => new PracticeContextService(repo(options), () => now, (key: string) => `http://localhost:3000/uploads/${key}`);
  const settings = (options = {}) => new PracticeSettingsService(repo(options), () => now);

  sheet('PracticeContextService', 'PC', 'src/modules/practice/service/PracticeContextServiceReport.test.ts');
  method('get(studentId, query)');
  tc('fake repository: main sheet Đàn tranh (analysis ready, own READY recording); SV-1 in class DTR101.M1 with open assignment as1 (1 / 3 used, target 72 BPM)', 'studentId="SV-1"; query={ sheetMusicId: "s-tranh" }',
    R('{ piece: { title: "Lý ngựa ô" }, sheet: { isMain: true, practice: { isAvailable: true }, referenceAudio: { url: ".../audio/2026-11/a1.wav", isFallback: false } }, enrollment: "IN_CLASS", classRecord: { name: "DTR101.M1" }, assignment: { id: "as1", usedSubmissions: 1, remainingSubmissions: 2, targetBpm: 72, state: "OPEN", countsTowardAssignment: true } }'), 'Normal', async () => {
      const dto = await context().get('SV-1', { sheetMusicId: 's-tranh' });
      assert.deepEqual([dto.sheet.practice.isAvailable, dto.sheet.referenceAudio, dto.enrollment, dto.classRecord.name], [true, { url: 'http://localhost:3000/uploads/audio/2026-11/a1.wav', isFallback: false }, 'IN_CLASS', 'DTR101.M1']);
      assert.deepEqual([dto.assignment.usedSubmissions, dto.assignment.remainingSubmissions, dto.assignment.state, dto.assignment.countsTowardAssignment], [1, 2, 'OPEN', true]);
    });
  tc('LEVEL sheet without own recording; main READY audio exists', 'query={ sheetMusicId: "s-level" }', R('{ sheet: { isMain: false, practice: { isAvailable: false, reason: "Hãy luyện bản chính của nhạc cụ này." }, referenceAudio: { isFallback: true } }, assignment: null (level sheets never count) }'), 'Normal', async () => {
    const dto = await context({ sheet: contextSheet({ id: 's-level', kind: 'LEVEL', referenceAudio: null }), mainAudio: { storageKey: 'audio/2026-11/a1.wav', status: 'READY' } }).get('SV-1', { sheetMusicId: 's-level' });
    assert.deepEqual([dto.sheet.practice, dto.sheet.referenceAudio.isFallback, dto.assignment], [{ isAvailable: false, reason: 'Hãy luyện bản chính của nhạc cụ này.' }, true, null]);
  });
  tc('main sheet without analysisFileUrl', 'query={ sheetMusicId: "s-tranh" }', R('{ sheet.practice: { isAvailable: false, reason: "Bản nhạc đang được chuẩn bị, vui lòng quay lại sau." } }'), 'Abnormal', async () => assert.deepEqual((await context({ sheet: contextSheet({ analysisFileUrl: null }) }).get('SV-1', { sheetMusicId: 's-tranh' })).sheet.practice, { isAvailable: false, reason: 'Bản nhạc đang được chuẩn bị, vui lòng quay lại sau.' }));
  tc('main sheet whose reference audio is PENDING', 'query={ sheetMusicId: "s-tranh" }', R('{ sheet.referenceAudio: null } (main sheet never borrows another recording)'), 'Boundary', async () => assert.equal((await context({ sheet: contextSheet({ referenceAudio: { storageKey: 'k', status: 'PENDING' } }) }).get('SV-1', { sheetMusicId: 's-tranh' })).sheet.referenceAudio, null));
  tc('student without any class', 'query={ sheetMusicId: "s-tranh" }', R('{ enrollment: "NO_CLASS", classRecord: null, assignment: null }'), 'Boundary', async () => { const dto = await context({ enrollments: [] }).get('SV-9', { sheetMusicId: 's-tranh' }); assert.deepEqual([dto.enrollment, dto.classRecord, dto.assignment], ['NO_CLASS', null, null]); });
  tc('assignment as1 with 3 / 3 used', 'query={ sheetMusicId: "s-tranh" }', R('{ assignment: { state: "EXHAUSTED", remainingSubmissions: 0, countsTowardAssignment: false } }'), 'Boundary', async () => {
    const dto = await context({ enrollments: [enrollment([candidate({ submissions: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'COMPLETED' }] })])] }).get('SV-1', { sheetMusicId: 's-tranh' });
    assert.deepEqual([dto.assignment.state, dto.assignment.remainingSubmissions, dto.assignment.countsTowardAssignment], ['EXHAUSTED', 0, false]);
  });
  tc('findContextSheet → null', 'query={ sheetMusicId: "s-x" }', E(404, null, SHEET_NOT_FOUND), 'Abnormal', () => expectAppError(() => context({ sheet: null }).get('SV-1', { sheetMusicId: 's-x' }), 404, null, SHEET_NOT_FOUND));
  method('PracticeSettingsService.getTargetBpm(studentId, query)');
  tc('open assignment as1 with targetBpm 72', 'query={ sheetMusicId: "s-tranh" }', R('{ targetBpm: 72, source: "ASSIGNMENT", assignmentId: "as1" }'), 'Normal', async () => assert.deepEqual(await settings().getTargetBpm('SV-1', { sheetMusicId: 's-tranh' }), { targetBpm: 72, source: 'ASSIGNMENT', assignmentId: 'as1' }));
  tc('assignment as1 without target BPM', 'query={ sheetMusicId: "s-tranh" }', R('{ targetBpm: 60, source: "DEFAULT", assignmentId: "as1" } (default tempo, not the piece BPM)'), 'Boundary', async () => assert.deepEqual(await settings({ enrollments: [enrollment([candidate({ targetBpm: null })])] }).getTargetBpm('SV-1', { sheetMusicId: 's-tranh' }), { targetBpm: 60, source: 'DEFAULT', assignmentId: 'as1' }));
  tc('assignment as1 { targetBpm: 0 }', 'query={ sheetMusicId: "s-tranh" }', R('{ targetBpm: 60, source: "DEFAULT" } (0 is not a tempo)'), 'Boundary', async () => assert.equal((await settings({ enrollments: [enrollment([candidate({ targetBpm: 0 })])] }).getTargetBpm('SV-1', { sheetMusicId: 's-tranh' })).source, 'DEFAULT'));
  tc('student without class', 'query={ sheetMusicId: "s-tranh" }', R('{ targetBpm: 60, source: "DEFAULT", assignmentId: null }'), 'Normal', async () => assert.deepEqual(await settings({ enrollments: [] }).getTargetBpm('SV-9', { sheetMusicId: 's-tranh' }), { targetBpm: 60, source: 'DEFAULT', assignmentId: null }));
  tc('findContextSheet → null', 'query={ sheetMusicId: "s-x" }', E(404, null, SHEET_NOT_FOUND), 'Abnormal', () => expectAppError(() => settings({ sheet: null }).getTargetBpm('SV-1', { sheetMusicId: 's-x' }), 404, null, SHEET_NOT_FOUND));
  method('PracticeSettingsService.getTunes(sheetMusicId)');
  tc('fake repository: Đàn tranh tunes Rê 4 (293.66 Hz), Sol 4 (392 Hz)', 'sheetMusicId="s-tranh"', R('{ instrument: { id: "i-tranh", name: "Đàn tranh" }, tunes: [{ id: "t1", name: "Rê 4", pitchHz: 293.66, displayOrder: 1 }, { id: "t2", name: "Sol 4", pitchHz: 392, displayOrder: 2 }] }'), 'Normal', async () => {
    assert.deepEqual(await settings().getTunes('s-tranh'), { instrument: { id: 'i-tranh', name: 'Đàn tranh' }, tunes: [{ id: 't1', name: 'Rê 4', pitchHz: 293.66, displayOrder: 1 }, { id: 't2', name: 'Sol 4', pitchHz: 392, displayOrder: 2 }] });
  });
  tc('findContextSheet → null', 'sheetMusicId="s-x"', E(404, null, SHEET_NOT_FOUND), 'Abnormal', () => expectAppError(() => settings({ sheet: null }).getTunes('s-x'), 404, null, SHEET_NOT_FOUND));

}
