import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel, Options } from 'amqplib';
import RhythmPublisherService from './RhythmPublisherService.ts';

const makeJob = (id = 'msg-1'): Audio.Job => ({ messageId: id, evaluationId: 'eval-1', templateUrl: 'https://example.com/t.wav', studentUrl: 'https://example.com/s.wav', instrumentId: 'dan_bau', instrument: { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 }, requestedAt: new Date().toISOString() });
const job = makeJob();

type SendHandler = (channel: ConfirmChannel, body: Buffer, options: Options.Publish, callback: (error?: unknown) => void) => void;

interface Fake {
  connector: (url: string, opts: { timeout: number }) => Promise<ChannelModel>;
  urls: string[]; connections: EventEmitter[]; closes: () => number; channel: EventEmitter;
  declarations: { queue: string; options: Options.AssertQueue }[]; sends: { queue: string; body: Buffer; options: Options.Publish }[];
}

function fake(onSend: SendHandler, extra: { createChannel?: () => Promise<ConfirmChannel>; closeRejects?: boolean } = {}): Fake {
  const urls: string[] = []; const connections: EventEmitter[] = []; const declarations: Fake['declarations'] = []; const sends: Fake['sends'] = [];
  let closeCount = 0;
  const channel = Object.assign(new EventEmitter(), {
    assertQueue: async (queue: string, options: Options.AssertQueue) => { declarations.push({ queue, options }); },
    sendToQueue: (queue: string, body: Buffer, options: Options.Publish, cb: (e?: unknown) => void) => { sends.push({ queue, body, options }); onSend(channel as unknown as ConfirmChannel, body, options, cb); }
  });
  const connector = async (url: string) => {
    urls.push(url);
    const connection = Object.assign(new EventEmitter(), {
      createConfirmChannel: extra.createChannel ?? (async () => channel as unknown as ConfirmChannel),
      close: async () => { closeCount += 1; if (extra.closeRejects) throw new Error('close fail'); }
    });
    connections.push(connection);
    return connection as unknown as ChannelModel;
  };
  return { connector, urls, connections, closes: () => closeCount, channel, declarations, sends };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const confirm: SendHandler = (_c, _b, _o, cb) => cb();

describe('RhythmPublisherService.publish (UTC-AD)', () => {
  afterEach(() => mock.restoreAll());

  it('UTC-AD-045 confirmed publish returns published with persistent mandatory message and queues asserted', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    assert.equal(await p.publish(job), 'published');
    assert.deepEqual(f.declarations.map((d) => d.queue), ['rhythm.evaluate.dlq', 'rhythm.evaluate.v1']);
    assert.equal(f.sends[0].queue, 'rhythm.evaluate.v1');
    assert.equal(f.sends[0].options.persistent, true); assert.equal(f.sends[0].options.mandatory, true);
    assert.equal(f.sends[0].options.messageId, 'msg-1'); assert.equal(f.sends[0].options.correlationId, 'eval-1');
    assert.match(f.urls[0], /heartbeat=30/);
    await p.close();
  });
  it('UTC-AD-046 returned (unroutable) message then confirm gives publish_failed', async () => {
    const f = fake((c, _b, o, cb) => { (c as unknown as EventEmitter).emit('return', { properties: { messageId: o.messageId } }); cb(); });
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    assert.equal(await p.publish(job), 'publish_failed'); await p.close();
  });
  it('UTC-AD-047 no confirm before timeout (20 ms) gives publish_unknown', async () => {
    const f = fake(() => undefined);
    const p = new RhythmPublisherService(f.connector, 20, 'amqp://localhost');
    assert.equal(await p.publish(job), 'publish_unknown'); await p.close();
  });
  it('UTC-AD-048 nack gives publish_unknown', async () => {
    const f = fake((_c, _b, _o, cb) => cb(new Error('nack')));
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    assert.equal(await p.publish(job), 'publish_unknown'); await p.close();
  });
  it('UTC-AD-049 connector rejection gives publish_failed', async () => {
    const p = new RhythmPublisherService(async () => { throw new Error('refused'); }, 20, 'amqp://localhost');
    assert.equal(await p.publish(job), 'publish_failed');
  });
  it('UTC-AD-050 empty broker URL gives publish_failed and no connection attempt', async () => {
    let calls = 0;
    const p = new RhythmPublisherService((async () => { calls += 1; throw new Error('x'); }) as never, 20, '');
    assert.equal(await p.publish(job), 'publish_failed'); assert.equal(calls, 0);
  });
  it('UTC-AD-051 publishing twice reuses one connection', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    assert.equal(await p.publish(makeJob('a')), 'published'); assert.equal(await p.publish(makeJob('b')), 'published');
    assert.equal(f.urls.length, 1); await p.close();
  });

  // New cases
  it('UTC-AD-094 keeps an existing heartbeat query parameter in the broker URL', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost?heartbeat=10');
    await p.publish(job);
    assert.match(f.urls[0], /heartbeat=10/); assert.doesNotMatch(f.urls[0], /heartbeat=30/); await p.close();
  });
  it('UTC-AD-095 publish_unknown when sendToQueue throws synchronously', async () => {
    const f = fake(() => { throw new Error('channel closed'); });
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    assert.equal(await p.publish(job), 'publish_unknown'); await p.close();
  });
  it('UTC-AD-096 publish_failed and connection closed when channel setup exceeds the timeout', async () => {
    const f = fake(confirm, { createChannel: () => new Promise<ConfirmChannel>(() => undefined) });
    const p = new RhythmPublisherService(f.connector, 20, 'amqp://localhost');
    assert.equal(await p.publish(job), 'publish_failed');
    await tick(); assert.equal(f.closes(), 1);
  });
  it('UTC-AD-097 publish_failed when the pending queue holds 100 unconfirmed messages (101st rejected)', async () => {
    const f = fake(() => undefined);
    const p = new RhythmPublisherService(f.connector, 5000, 'amqp://localhost');
    const first = Array.from({ length: 100 }, (_v, i) => p.publish(makeJob(`m${i}`)));
    await tick(); await tick();
    assert.equal(await p.publish(makeJob('overflow')), 'publish_failed');
    await p.close();
    assert.ok((await Promise.all(first)).every((s) => s === 'publish_unknown'));
  });
  it('UTC-AD-098 error events on connection and channel are logged without throwing', async () => {
    const errorLog = mock.method(console, 'error', () => undefined);
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await p.publish(job);
    f.connections[0].emit('error', new Error('boom')); f.channel.emit('error', new Error('boom'));
    assert.deepEqual(errorLog.mock.calls.map((c) => c.arguments[0]), ['Kết nối hàng đợi gặp lỗi.', 'Kênh gửi job gặp lỗi.']);
    await p.close();
  });
  it('UTC-AD-099 reconnects on next publish after the connection emits close', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await p.publish(makeJob('a'));
    f.connections[0].emit('close');
    assert.equal(await p.publish(makeJob('b')), 'published'); assert.equal(f.urls.length, 2); await p.close();
  });
  it('UTC-AD-100 message body is the JSON-serialised job on queue rhythm.evaluate.v1 with application/json', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await p.publish(job);
    assert.deepEqual(JSON.parse(f.sends[0].body.toString()), job); assert.equal(f.sends[0].options.contentType, 'application/json');
    await p.close();
  });
  it('UTC-AD-101 dead-letter queue is durable and main queue routes dead letters to it', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await p.publish(job);
    assert.deepEqual(f.declarations[0].options, { durable: true });
    assert.deepEqual(f.declarations[1].options, { durable: true, arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'rhythm.evaluate.dlq' } });
    await p.close();
  });
});

describe('RhythmPublisherService.close (UTC-AD)', () => {
  it('UTC-AD-102 closes the open connection', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await p.publish(job); await p.close();
    assert.equal(f.closes(), 1);
  });
  it('UTC-AD-103 resolves without error when nothing was ever opened', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await assert.doesNotReject(p.close()); assert.equal(f.closes(), 0);
  });
  it('UTC-AD-104 swallows a rejection from connection.close()', async () => {
    const f = fake(confirm, { closeRejects: true });
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await p.publish(job);
    await assert.doesNotReject(p.close());
  });
  it('UTC-AD-105 pending unconfirmed publish resolves publish_unknown when closed', async () => {
    const f = fake(() => undefined);
    const p = new RhythmPublisherService(f.connector, 5000, 'amqp://localhost');
    const pending = p.publish(job);
    await tick(); await tick();
    await p.close();
    assert.equal(await pending, 'publish_unknown');
  });
  it('UTC-AD-106 calling close twice only closes the connection once and next publish reconnects', async () => {
    const f = fake(confirm);
    const p = new RhythmPublisherService(f.connector, 1000, 'amqp://localhost');
    await p.publish(makeJob('a')); await p.close(); await p.close();
    assert.equal(f.closes(), 1);
    assert.equal(await p.publish(makeJob('b')), 'published'); assert.equal(f.urls.length, 2); await p.close();
  });
});
