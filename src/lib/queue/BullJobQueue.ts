import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions, Job } from 'bullmq';

// Redis-backed queue (BullMQ) with fixed-delay retries. The worker runs inside the API process.
export default class BullJobQueue<TPayload> implements Backend.JobQueue<TPayload> {
  readonly options: Backend.JobQueueOptions<TPayload>;
  readonly queue: Queue;
  readonly worker: Worker;

  constructor(redisUrl: string, options: Backend.JobQueueOptions<TPayload>) {
    this.options = options;
    const connection = BullJobQueue.toConnectionOptions(redisUrl);
    this.queue = new Queue(options.name, { connection });
    this.worker = new Worker(options.name, (job: Job) => options.handler(job.data as TPayload), { connection });
    this.worker.on('failed', (job, error) => {
      if (!job || job.attemptsMade < options.attempts) return;
      void options.onFailed(job.data as TPayload, error);
    });
  }

  static toConnectionOptions(redisUrl: string): ConnectionOptions {
    const parsedUrl = new URL(redisUrl);
    return {
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 6379),
      username: parsedUrl.username || undefined,
      password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
      db: parsedUrl.pathname.length > 1 ? Number(parsedUrl.pathname.slice(1)) : 0,
      tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null
    };
  }

  async enqueue(jobId: string, payload: TPayload): Promise<void> {
    await this.queue.add(this.options.name, payload, {
      jobId,
      attempts: this.options.attempts,
      backoff: { type: 'fixed', delay: this.options.backoffMs },
      removeOnComplete: 1000,
      removeOnFail: 1000
    });
  }

  // Waiting/delayed jobs are removed; an active job cannot be stopped here, so its result is
  // discarded later by the job-id check in the callback handler.
  async cancel(jobId: string): Promise<void> {
    try {
      await this.queue.remove(jobId);
    } catch {
      // job is locked by a worker (active) – ignored on purpose, see comment above
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
