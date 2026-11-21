/* eslint-disable @typescript-eslint/no-explicit-any -- the AMQP connection is a partial fake */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import TemplateAnalysisPublisherService from './TemplateAnalysisPublisherService.ts';

const Publisher = TemplateAnalysisPublisherService as any;

const job = {
  messageId: 'msg-1',
  analysisId: 'an-1',
  sheetMusicId: 's1',
  mediaFileId: 'm1',
  mediaUrl: 'http://localhost:3000/uploads/media/t.wav',
  instrumentCode: 'dan_tranh',
  requestedAt: '2026-11-07T03:00:00.000Z'
};

type BrokerMode = 'ack' | 'return' | 'silent' | 'nack' | 'throw';

// Kết nối AMQP giả: ghi lại các thao tác vào events theo thứ tự
function createFakeAmqp(mode: BrokerMode, events: any[] = []) {
  const channel: any = Object.assign(new EventEmitter(), {
    assertQueue: async (queue: string, options: unknown) => {
      events.push(['assertQueue', queue, options]);
    },
    sendToQueue: (queue: string, body: Buffer, options: any, callback: (error?: unknown) => void) => {
      if (mode === 'throw') throw new Error('channel closed');
      events.push(['send', queue, JSON.parse(body.toString()), options]);
      if (mode === 'return') {
        channel.emit('return', { properties: { messageId: options.messageId } });
        callback();
      }
      if (mode === 'ack') setImmediate(() => callback());
      if (mode === 'nack') setImmediate(() => callback(new Error('nack')));
    }
  });
  const connection: any = Object.assign(new EventEmitter(), {
    createConfirmChannel: async () => channel,
    close: async () => {
      events.push(['close']);
    }
  });
  const connect = async (url: string) => {
    events.push(['connect', url]);
    return connection;
  };
  return { connect, connection, channel };
}

describe('TemplateAnalysisPublisherService (Gửi job phân tích bản thu mẫu)', () => {
  describe('publish', () => {
    it('broker xác nhận: khai báo DLQ rồi queue chính và gửi message persistent, mandatory', async () => {
      const events: any[] = [];
      const publisher = new Publisher(createFakeAmqp('ack', events).connect, 1000, 'amqp://guest:guest@localhost:5672');

      const result = await publisher.publish(job);

      const queues = events.filter((event) => event[0] === 'assertQueue');
      const [, queue, body, options] = events.find((event) => event[0] === 'send');
      assert.equal(result, 'published');
      assert.deepEqual(queues.map((event) => event[1]), ['rhythm.template.analyze.dlq', 'rhythm.template.analyze.v1']);
      assert.equal(queues[1][2].arguments['x-dead-letter-routing-key'], 'rhythm.template.analyze.dlq');
      assert.equal(queue, 'rhythm.template.analyze.v1');
      assert.deepEqual(body, job);
      assert.equal(options.persistent, true);
      assert.equal(options.mandatory, true);
      assert.equal(options.correlationId, 'an-1');
      assert.equal(options.contentType, 'application/json');
      assert.match(events[0][1], /heartbeat=30/);
      await publisher.close();
    });

    it('trả về publish_failed khi message bị trả lại (unroutable)', async () => {
      const publisher = new Publisher(createFakeAmqp('return').connect, 1000, 'amqp://localhost');

      assert.equal(await publisher.publish(job), 'publish_failed');
      await publisher.close();
    });

    it('giá trị biên: broker không xác nhận trong 20 ms thì trả về publish_unknown và đóng kết nối', async () => {
      const events: any[] = [];
      const publisher = new Publisher(createFakeAmqp('silent', events).connect, 20, 'amqp://localhost');

      assert.equal(await publisher.publish(job), 'publish_unknown');
      assert.ok(events.some((event) => event[0] === 'close'));
    });

    it('trả về publish_failed khi không kết nối được broker hoặc brokerUrl rỗng', async () => {
      const failingConnect = async () => {
        throw new Error('ECONNREFUSED');
      };

      assert.equal(await new Publisher(failingConnect, 20, 'amqp://localhost').publish(job), 'publish_failed');
      assert.equal(await new Publisher(createFakeAmqp('ack').connect, 20, '').publish(job), 'publish_failed');
    });

    it('giá trị biên: dùng lại một kết nối cho nhiều job và kết nối lại sau khi connection đóng', async () => {
      const events: any[] = [];
      const fakeAmqp = createFakeAmqp('ack', events);
      const publisher = new Publisher(fakeAmqp.connect, 1000, 'amqp://localhost');
      const countConnects = () => events.filter((event) => event[0] === 'connect').length;

      await publisher.publish(job);
      await publisher.publish({ ...job, messageId: 'msg-2' });
      assert.equal(countConnects(), 1);

      fakeAmqp.connection.emit('close');
      assert.equal(await publisher.publish({ ...job, messageId: 'msg-3' }), 'published');
      assert.equal(countConnects(), 2);
      await publisher.close();
    });
  });

  describe('close', () => {
    it('đóng kết nối đang mở', async () => {
      const events: any[] = [];
      const publisher = new Publisher(createFakeAmqp('ack', events).connect, 1000, 'amqp://localhost');
      await publisher.publish(job);

      await publisher.close();

      assert.ok(events.some((event) => event[0] === 'close'));
    });
  });
});
