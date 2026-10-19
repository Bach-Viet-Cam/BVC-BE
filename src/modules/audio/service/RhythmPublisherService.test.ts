import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel, Options } from 'amqplib';
import RhythmPublisherService from './RhythmPublisherService.ts';

const job: Audio.Job = { messageId: 'msg-1', evaluationId: 'eval-1', templateUrl: 'https://example.com/t.wav', studentUrl: 'https://example.com/s.wav', instrumentId: 'dan_bau', requestedAt: new Date().toISOString() };

test('Publisher chỉ báo thành công sau confirm và dùng đúng contract queue', async () => {
  const emitter = new EventEmitter();
  const declarations: { queue: string; options: Options.AssertQueue }[] = [];
  let acknowledge: (() => void) | undefined;
  const channel = Object.assign(emitter, {
    assertQueue: async (queue: string, options: Options.AssertQueue) => { declarations.push({ queue, options }); },
    sendToQueue: (queue: string, body: Buffer, options: Options.Publish, callback: () => void) => {
      assert.equal(queue, 'rhythm.evaluate.v1'); assert.deepEqual(JSON.parse(body.toString()), job);
      assert.equal(options.persistent, true); assert.equal(options.mandatory, true);
      assert.equal(options.messageId, job.messageId); acknowledge = callback;
    }
  }) as unknown as ConfirmChannel;
  const connection = Object.assign(new EventEmitter(), { createConfirmChannel: async () => channel, close: async () => undefined }) as unknown as ChannelModel;
  const publisher = new RhythmPublisherService(async () => connection, 1000, 'amqp://localhost');
  const pending = publisher.publish(job);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(declarations[1], { queue: 'rhythm.evaluate.v1', options: { durable: true, arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'rhythm.evaluate.dlq' } } });
  assert.ok(acknowledge); acknowledge(); assert.equal(await pending, 'published');
  await publisher.close();
});

test('Unroutable không thành công dù broker confirm; timeout không tự gửi lại', async () => {
  for (const mode of ['returned', 'timeout']) {
    let sends = 0;
    const channel = Object.assign(new EventEmitter(), {
      assertQueue: async () => undefined,
      sendToQueue: (_queue: string, _body: Buffer, _options: Options.Publish, acknowledge: () => void) => {
        sends += 1;
        if (mode === 'returned') { channel.emit('return', { properties: { messageId: job.messageId } }); acknowledge(); }
      }
    }) as unknown as ConfirmChannel;
    const connection = Object.assign(new EventEmitter(), { createConfirmChannel: async () => channel, close: async () => undefined }) as unknown as ChannelModel;
    const publisher = new RhythmPublisherService(async () => connection, 20, 'amqp://localhost');
    assert.equal(await publisher.publish(job), mode === 'returned' ? 'publish_failed' : 'publish_unknown');
    assert.equal(sends, 1); await publisher.close();
  }
  assert.equal(await new RhythmPublisherService(async () => { throw new Error('Không kết nối được.'); }, 20, 'amqp://localhost').publish(job), 'publish_failed');
});
