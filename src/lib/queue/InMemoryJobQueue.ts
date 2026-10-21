// Single-process retrying queue used when Redis is not configured (dev / tests). Jobs are lost on restart.
export default class InMemoryJobQueue<TPayload> implements Backend.JobQueue<TPayload> {
  readonly options: Backend.JobQueueOptions<TPayload>;
  readonly timers = new Map<string, NodeJS.Timeout>();
  readonly cancelledJobIds = new Set<string>();

  constructor(options: Backend.JobQueueOptions<TPayload>) {
    this.options = options;
  }

  async enqueue(jobId: string, payload: TPayload): Promise<void> {
    this.cancelledJobIds.delete(jobId);
    this.schedule(jobId, payload, 1, 0);
  }

  schedule(jobId: string, payload: TPayload, attempt: number, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(jobId);
      void this.run(jobId, payload, attempt);
    }, delayMs);
    timer.unref();
    this.timers.set(jobId, timer);
  }

  async run(jobId: string, payload: TPayload, attempt: number): Promise<void> {
    if (this.cancelledJobIds.has(jobId)) return;
    try {
      await this.options.handler(payload);
    } catch (error) {
      if (this.cancelledJobIds.has(jobId)) return;
      if (attempt < this.options.attempts) {
        this.schedule(jobId, payload, attempt + 1, this.options.backoffMs);
        return;
      }
      await this.options.onFailed(payload, error);
    }
  }

  async cancel(jobId: string): Promise<void> {
    this.cancelledJobIds.add(jobId);
    const timer = this.timers.get(jobId);
    if (timer) clearTimeout(timer);
    this.timers.delete(jobId);
  }

  async close(): Promise<void> {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }
}
