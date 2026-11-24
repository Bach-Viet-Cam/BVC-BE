import { test } from 'node:test';
import assert from 'node:assert/strict';
import NotificationDispatchService from './NotificationDispatchService.ts';
import NotificationService from './NotificationService.ts';

test('UTC-NDS-001 - start sets 30s interval, unrefs and ticks immediately', (t) => {
  NotificationDispatchService.timer = null;
  let capturedMs = 0;
  let unrefCount = 0;
  const fakeTimer = { unref: () => { unrefCount += 1; } };
  const setMock = t.mock.method(globalThis, 'setInterval', ((fn: () => void, ms: number) => {
    capturedMs = ms;
    return fakeTimer;
  }) as never);
  const tickMock = t.mock.method(NotificationDispatchService, 'tick', (async () => {}) as never);

  try {
    NotificationDispatchService.start();

    assert.equal(setMock.mock.calls.length, 1);
    assert.equal(capturedMs, 30000);
    assert.equal(unrefCount, 1);
    assert.equal(tickMock.mock.calls.length, 1);
    assert.strictEqual(NotificationDispatchService.timer, fakeTimer);
  } finally {
    NotificationDispatchService.timer = null;
  }
});

test('UTC-NDS-002 - start keeps an existing timer', (t) => {
  const sentinel = { unref: () => {} } as never;
  NotificationDispatchService.timer = sentinel;
  const setMock = t.mock.method(globalThis, 'setInterval', (() => sentinel) as never);
  const tickMock = t.mock.method(NotificationDispatchService, 'tick', (async () => {}) as never);

  try {
    NotificationDispatchService.start();

    // R1: tưởng tạo thêm timer
    assert.strictEqual(NotificationDispatchService.timer, sentinel);
    assert.equal(setMock.mock.calls.length, 0);
    assert.equal(tickMock.mock.calls.length, 0);
  } finally {
    NotificationDispatchService.timer = null;
  }
});

test('UTC-NDS-003 - stop clears timer and resets it to null', (t) => {
  const timer = { unref: () => {} } as never;
  NotificationDispatchService.timer = timer;
  const clearMock = t.mock.method(globalThis, 'clearInterval', (() => {}) as never);

  try {
    NotificationDispatchService.stop();

    assert.equal(NotificationDispatchService.timer, null);
    assert.equal(clearMock.mock.calls[0].arguments[0], timer);
  } finally {
    NotificationDispatchService.timer = null;
  }
});

test('UTC-NDS-004 - tick swallows delivery errors after logging', async (t) => {
  const boom = new Error('boom');
  t.mock.method(NotificationService, 'deliverDue', async () => { throw boom; });
  const errorMock = t.mock.method(console, 'error', (() => {}) as never);

  await NotificationDispatchService.tick();

  assert.equal(errorMock.mock.calls.length, 1);
  assert.equal(errorMock.mock.calls[0].arguments[0], 'Không thể gửi thông báo hẹn giờ:');
  assert.strictEqual(errorMock.mock.calls[0].arguments[1], boom);
});
