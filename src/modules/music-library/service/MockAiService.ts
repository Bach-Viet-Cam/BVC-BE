import EnvConfig from '../../../config/EnvConfig.ts';

interface MockAnalysisJob { jobId: string; sheetMusicId: string; callbackUrl: string; }

// Stand-in for the Python librosa service during development: answers READY after a short delay
export default class MockAiService {
  static readonly timers = new Map<string, NodeJS.Timeout>();

  static acceptJob(analysisJob: MockAnalysisJob): void {
    const timer = setTimeout(() => {
      MockAiService.timers.delete(analysisJob.jobId);
      void MockAiService.sendCallback(analysisJob);
    }, EnvConfig.mockAiDelayMs);
    timer.unref();
    MockAiService.timers.set(analysisJob.jobId, timer);
  }

  static cancelJob(jobId: string): void {
    const timer = MockAiService.timers.get(jobId);
    if (timer) clearTimeout(timer);
    MockAiService.timers.delete(jobId);
  }

  static async sendCallback(analysisJob: MockAnalysisJob): Promise<void> {
    try {
      await fetch(analysisJob.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Callback-Secret': EnvConfig.aiCallbackSecret },
        body: JSON.stringify({
          jobId: analysisJob.jobId,
          status: 'READY',
          analysisFileUrl: `mock://analysis/${analysisJob.sheetMusicId}/${analysisJob.jobId}.json`,
          timeSignatureMissing: false
        })
      });
    } catch (error) {
      console.warn('[mock-ai] callback failed', error);
    }
  }
}
