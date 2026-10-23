import { connect, type ChannelModel, type ConfirmChannel, type Message } from 'amqplib';
import EnvConfig from '../../../config/EnvConfig.ts';

export interface TemplateAnalysisJob {
  messageId: string;
  analysisId: string;
  sheetMusicId: string;
  mediaFileId: string;
  mediaUrl: string;
  instrumentCode: 'dan_bau';
  requestedAt: string;
}

export type TemplatePublicationState = 'published' | 'publish_failed' | 'publish_unknown';

// The template queue has a different, deliberately strict contract from rhythm.evaluate.v1.
export default class TemplateAnalysisPublisherService {
  static readonly instance = new TemplateAnalysisPublisherService();
  static readonly queue = 'rhythm.template.analyze.v1';
  static readonly deadLetterQueue = 'rhythm.template.analyze.dlq';

  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private opening?: Promise<ConfirmChannel>;
  private readonly pending = new Map<string, (state: TemplatePublicationState) => void>();

  constructor(
    private readonly connector: (url: string, options: { timeout: number }) => Promise<ChannelModel> = connect,
    private readonly timeoutMs = 10_000,
    private readonly brokerUrl = EnvConfig.rabbitmqUrl
  ) {}

  private invalidate(): void {
    this.channel = undefined;
    this.connection = undefined;
    for (const finish of this.pending.values()) finish('publish_unknown');
  }

  private async open(): Promise<ConfirmChannel> {
    if (!this.brokerUrl) throw new Error('RabbitMQ is not configured.');
    const brokerUrl = new URL(this.brokerUrl);
    if (!brokerUrl.searchParams.has('heartbeat')) brokerUrl.searchParams.set('heartbeat', '30');
    const connection = await this.connector(brokerUrl.toString(), { timeout: this.timeoutMs });
    this.connection = connection;
    connection.once('close', () => { if (this.connection === connection) this.invalidate(); });
    const channel = await connection.createConfirmChannel();
    channel.once('close', () => { if (this.channel === channel) this.invalidate(); });
    channel.on('return', (message: Message) => this.pending.get(message.properties.messageId ?? '')?.('publish_failed'));
    await channel.assertQueue(TemplateAnalysisPublisherService.deadLetterQueue, { durable: true });
    await channel.assertQueue(TemplateAnalysisPublisherService.queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': TemplateAnalysisPublisherService.deadLetterQueue
      }
    });
    this.channel = channel;
    return channel;
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    this.opening ??= this.open().finally(() => { this.opening = undefined; });
    return this.opening;
  }

  async publish(job: TemplateAnalysisJob): Promise<TemplatePublicationState> {
    let channel: ConfirmChannel;
    try { channel = await this.getChannel(); } catch { return 'publish_failed'; }
    return new Promise((resolve) => {
      const finish = (state: TemplatePublicationState): void => {
        if (!this.pending.delete(job.messageId)) return;
        clearTimeout(timer);
        resolve(state);
      };
      const timer = setTimeout(() => { finish('publish_unknown'); void this.close(); }, this.timeoutMs);
      this.pending.set(job.messageId, finish);
      try {
        channel.sendToQueue(TemplateAnalysisPublisherService.queue, Buffer.from(JSON.stringify(job)), {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          messageId: job.messageId,
          correlationId: job.analysisId,
          timestamp: Math.floor(Date.now() / 1000)
        }, (error: unknown) => finish(error ? 'publish_unknown' : 'published'));
      } catch { finish('publish_unknown'); }
    });
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.invalidate();
    if (connection) await connection.close().catch(() => undefined);
  }
}
