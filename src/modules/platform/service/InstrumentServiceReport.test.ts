import { test } from 'node:test';
import assert from 'node:assert/strict';
import InstrumentService from './InstrumentService.ts';
import InstrumentRepository from '../repository/InstrumentRepository.ts';
import AppError from '../../../utils/AppError.ts';

const createdAt = new Date('2026-11-01T00:00:00Z');

const instrument = (overrides: Partial<Backend.InstrumentRecord> = {}): Backend.InstrumentRecord => ({
  id: 'i-tranh', code: 'DTR', name: 'Đàn tranh', description: null, isActive: true, createdAt, ...overrides
});

const tune = (id: string, tuneName: string, pitch: number, displayOrder: number): Backend.InstrumentTuneRecord => ({
  id, instrumentId: 'i-tranh', tuneName, pitch, displayOrder, createdAt, updatedAt: createdAt
});

const listQuery = (q?: string): Backend.InstrumentListQuery => ({ q, status: 'all', sortBy: 'code', sortDir: 'asc' });

const isAppError = (statusCode: number, message: string) => (error: unknown) =>
  error instanceof AppError && error.statusCode === statusCode && error.message === message;

const NOT_FOUND = 'Không tìm thấy nhạc cụ.';

test('UTC-IS-001 - list keeps tunesCount and maps tunes only when present', async (t) => {
  const listMock = t.mock.method(InstrumentRepository, 'list', async () => [
    instrument({ tunesCount: 16 }),
    instrument({ id: 'i-sao', code: 'STR', name: 'Sáo trúc', tunes: [tune('t1', 'Rê 4', 293.66, 1), tune('t2', 'Mi 4', 329.63, 2)] })
  ]);
  const query = listQuery('');

  const result = await InstrumentService.list(query);

  assert.equal(listMock.mock.calls[0].arguments[0], query);
  assert.equal(result[0].code, 'DTR');
  assert.equal(result[0].tunesCount, 16);
  assert.equal('tunes' in result[0], false);
  assert.equal(result[1].tunesCount, 2);
  assert.deepEqual(result[1].tunes?.map(({ tuneName, pitch, displayOrder }) => ({ tuneName, pitch, displayOrder })), [
    { tuneName: 'Rê 4', pitch: 293.66, displayOrder: 1 },
    { tuneName: 'Mi 4', pitch: 329.63, displayOrder: 2 }
  ]);
});

test('UTC-IS-002 - list defaults tunesCount to 0 when repository has no tunes info', async (t) => {
  t.mock.method(InstrumentRepository, 'list', async () => [instrument()]);

  const result = await InstrumentService.list(listQuery());

  assert.equal(result[0].tunesCount, 0);
});

test('UTC-IS-003 - getOrThrow returns the found instrument', async (t) => {
  const record = instrument();
  t.mock.method(InstrumentRepository, 'findById', async () => record);

  assert.equal(await InstrumentService.getOrThrow('i-tranh'), record);
});

test('UTC-IS-004 - getOrThrow throws 404 when instrument does not exist', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => null);

  await assert.rejects(InstrumentService.getOrThrow('i-x'), isAppError(404, NOT_FOUND));
});

test('UTC-IS-005 - create saves a new active instrument with no tunes', async (t) => {
  t.mock.method(InstrumentRepository, 'findByCode', async () => null);
  const createMock = t.mock.method(InstrumentRepository, 'create', async () =>
    instrument({ id: 'i-nhi', code: 'DNH', name: 'Đàn nhị', description: '2 dây' }));
  const input = { code: 'DNH', name: 'Đàn nhị', description: '2 dây' };

  const result = await InstrumentService.create(input);

  assert.equal(createMock.mock.callCount(), 1);
  assert.equal(createMock.mock.calls[0].arguments[0], input);
  assert.deepEqual(
    { code: result.code, name: result.name, isActive: result.isActive, tunesCount: result.tunesCount },
    { code: 'DNH', name: 'Đàn nhị', isActive: true, tunesCount: 0 }
  );
});

test('UTC-IS-006 - create rejects a duplicate code with 409', async (t) => {
  t.mock.method(InstrumentRepository, 'findByCode', async () => instrument());
  const createMock = t.mock.method(InstrumentRepository, 'create', async () => instrument());

  await assert.rejects(
    InstrumentService.create({ code: 'DTR', name: 'Đàn tranh 2' }),
    isAppError(409, 'Mã nhạc cụ đã tồn tại.')
  );
  assert.equal(createMock.mock.callCount(), 0);
});

test('UTC-IS-007 - update renames an existing instrument', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => instrument());
  const updateMock = t.mock.method(InstrumentRepository, 'update', async () => instrument({ name: 'Đàn tranh 16 dây' }));
  const input = { name: 'Đàn tranh 16 dây' };

  const result = await InstrumentService.update('i-tranh', input);

  assert.equal(result.name, 'Đàn tranh 16 dây');
  assert.deepEqual(updateMock.mock.calls[0].arguments, ['i-tranh', input]);
});

test('UTC-IS-008 - update throws 404 and does not write when instrument is missing', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => null);
  const updateMock = t.mock.method(InstrumentRepository, 'update', async () => instrument());

  await assert.rejects(InstrumentService.update('i-x', { name: 'X' }), isAppError(404, NOT_FOUND));
  assert.equal(updateMock.mock.callCount(), 0);
});

test('UTC-IS-009 - setActive(false) deactivates the instrument', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => instrument());
  const activeMock = t.mock.method(InstrumentRepository, 'updateActive', async () => instrument({ isActive: false }));

  const result = await InstrumentService.setActive('i-tranh', false);

  assert.equal(result.isActive, false);
  assert.deepEqual(activeMock.mock.calls[0].arguments, ['i-tranh', false]);
});

test('UTC-IS-010 - setActive(true) turns an inactive instrument back on', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => instrument({ isActive: false }));
  t.mock.method(InstrumentRepository, 'updateActive', async () => instrument({ isActive: true }));

  const result = await InstrumentService.setActive('i-tranh', true);

  assert.equal(result.isActive, true);
});

test('UTC-IS-011 - getTunes returns tunes without timestamps', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => instrument());
  t.mock.method(InstrumentRepository, 'listTunes', async () => [tune('t1', 'Rê 4', 293.66, 1), tune('t2', 'Mi 4', 329.63, 2)]);

  const result = await InstrumentService.getTunes('i-tranh');

  assert.equal(result.length, 2);
  assert.equal(result[0].tuneName, 'Rê 4');
  assert.equal(result[0].pitch, 293.66);
  assert.equal(result[1].tuneName, 'Mi 4');
  assert.equal('createdAt' in result[0], false);
  assert.equal('updatedAt' in result[0], false);
});

test('UTC-IS-012 - getTunes throws 404 when instrument is missing', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => null);

  await assert.rejects(InstrumentService.getTunes('i-x'), isAppError(404, NOT_FOUND));
});

test('UTC-IS-013 - setTunes replaces tunes and returns saved rows', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => instrument());
  const replaceMock = t.mock.method(InstrumentRepository, 'replaceTunes', async () => [tune('t3', 'Sol 4', 392, 1)]);
  const tunes = [{ tuneName: 'Sol 4', pitch: 392, displayOrder: 1 }];

  const result = await InstrumentService.setTunes('i-tranh', tunes);

  assert.deepEqual(result.map(({ tuneName, pitch, displayOrder }) => ({ tuneName, pitch, displayOrder })), tunes);
  assert.deepEqual(replaceMock.mock.calls[0].arguments, ['i-tranh', tunes]);
});

test('UTC-IS-014 - setTunes with an empty list removes all tunes', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => instrument());
  t.mock.method(InstrumentRepository, 'replaceTunes', async () => []);

  assert.deepEqual(await InstrumentService.setTunes('i-tranh', []), []);
});

test('UTC-IS-015 - setTunes throws 404 and does not write when instrument is missing', async (t) => {
  t.mock.method(InstrumentRepository, 'findById', async () => null);
  const replaceMock = t.mock.method(InstrumentRepository, 'replaceTunes', async () => []);

  await assert.rejects(
    InstrumentService.setTunes('i-x', [{ tuneName: 'Sol 4', pitch: 392, displayOrder: 1 }]),
    isAppError(404, NOT_FOUND)
  );
  assert.equal(replaceMock.mock.callCount(), 0);
});
