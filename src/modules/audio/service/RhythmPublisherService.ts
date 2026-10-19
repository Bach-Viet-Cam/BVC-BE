import { connect, type ChannelModel, type ConfirmChannel, type Message } from 'amqplib';
import EnvConfig from '../../../config/EnvConfig.ts';
import AudioConstant from '../constant/AudioConstant.ts';

export default class RhythmPublisherService {
  static readonly instance = new RhythmPublisherService();
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private opening?: Promise<ConfirmChannel>;
  private readonly pending = new Map<string, (state: Audio.PublicationState) => void>();

  constructor(
    private readonly connector: (url: string, options: { timeout: number }) => Promise<ChannelModel> = connect,
    private readonly timeoutMs: number = AudioConstant.requestTimeoutMs,
    private readonly brokerUrl: string = EnvConfig.rabbitmqUrl
  ) {}

  private async open(): Promise<ConfirmChannel> {
    if (!this.brokerUrl) throw new Error('Chưa cấu hình kết nối hàng đợi.');
    const brokerUrl = new URL(this.brokerUrl);
    if (!brokerUrl.searchParams.has('heartbeat')) brokerUrl.searchParams.set('heartbeat', '30');
    const connection = await this.connector(brokerUrl.toString(), { timeout: this.timeoutMs });
    this.connection = connection;
    connection.on('error', () => { console.error('Kết nối hàng đợi gặp lỗi.'); });
    connection.once('close', () => { if (this.connection === connection) this.invalidate(); });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const channel = await Promise.race([
        this.configureChannel(connection),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Quá thời gian thiết lập hàng đợi.')), this.timeoutMs); })
      ]);
      if (this.connection !== connection) throw new Error('Kết nối hàng đợi đã đóng.');
      this.channel = channel;
      return channel;
    } catch (error) {
      void connection.close().catch(() => undefined);
      throw error;
    } finally { clearTimeout(timer); }
  }

  private async configureChannel(connection: ChannelModel): Promise<ConfirmChannel> {
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => { console.error('Kênh gửi job gặp lỗi.'); });
    channel.once('close', () => {
      if (this.channel === channel) {
        this.invalidate();
        void connection.close().catch(() => undefined);
      }
    });
    channel.on('return', (message: Message) => { this.pending.get(message.properties.messageId ?? '')?.('publish_failed'); });
    await channel.assertQueue(AudioConstant.deadLetterQueue, { durable: true });
    await channel.assertQueue(AudioConstant.queue, { durable: true, arguments: {
      'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': AudioConstant.deadLetterQueue
    } });
    return channel;
  }

  private invalidate(): void {
    this.channel = undefined;
    this.connection = undefined;
    for (const finish of this.pending.values()) finish('publish_unknown');
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    if (!this.opening) {
      this.opening = this.open().finally(() => { this.opening = undefined; });
    }
    return this.opening;
  }

  async publish(job: Audio.Job): Promise<Audio.PublicationState> {
    let channel: ConfirmChannel;
    try { channel = await this.getChannel(); } catch { return 'publish_failed'; }
    if (this.pending.size >= AudioConstant.maxPendingMessages) return 'publish_failed';
    return new Promise((resolve) => {
      const finish = (state: Audio.PublicationState): void => {
        if (!this.pending.delete(job.messageId)) return;
        clearTimeout(timer);
        resolve(state);
      };
      const timer = setTimeout(() => {
        finish('publish_unknown');
        void this.close();
      }, this.timeoutMs);
      this.pending.set(job.messageId, finish);
      try {
        channel.sendToQueue(AudioConstant.queue, Buffer.from(JSON.stringify(job)), {
          persistent: true, mandatory: true, contentType: 'application/json',
          messageId: job.messageId, correlationId: job.evaluationId, timestamp: Math.floor(Date.now() / 1000)
        }, (error: unknown) => { finish(error ? 'publish_unknown' : 'published'); });
      } catch { finish('publish_unknown'); }
    });
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.invalidate();
    if (connection) await connection.close().catch(() => undefined);
  }
}
