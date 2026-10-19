import crypto from 'node:crypto';
import EnvConfig from '../../../config/EnvConfig.ts';
import NotificationService from '../../../lib/NotificationService.ts';
import BullJobQueue from '../../../lib/queue/BullJobQueue.ts';
import InMemoryJobQueue from '../../../lib/queue/InMemoryJobQueue.ts';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';

type AnalysisQueue = Backend.JobQueue<MusicLibrary.AnalysisJobPayload>;
interface AnalysisTarget {
  id: string;
  kind: MusicLibrary.SheetKind;
  analysisJobId: string | null;
  analysisFileUrl: string | null;
  referenceAudio: { id: string } | null;
}

const NOTIFICATIONS = MusicLibraryConstant.notifications;
const QUEUE_CONFIG = MusicLibraryConstant.analysisQueue;

// JOB-01 / JOB-02: reference-recording analysis of main sheets by the Python AI service
export default class AnalysisService {
  static queueInstance: AnalysisQueue | null = null;

  static get queue(): AnalysisQueue {
    if (AnalysisService.queueInstance) return AnalysisService.queueInstance;
    const queueOptions: Backend.JobQueueOptions<MusicLibrary.AnalysisJobPayload> = {
      name: QUEUE_CONFIG.NAME,
      attempts: QUEUE_CONFIG.ATTEMPTS,
      backoffMs: EnvConfig.aiRetryDelayMs,
      handler: AnalysisService.dispatchJob,
      onFailed: AnalysisService.markDispatchFailed
    };
    AnalysisService.queueInstance = EnvConfig.redisUrl
      ? new BullJobQueue(EnvConfig.redisUrl, queueOptions)
      : new InMemoryJobQueue(queueOptions);
    return AnalysisService.queueInstance;
  }

  static useQueue(queue: AnalysisQueue | null): void {
    AnalysisService.queueInstance = queue;
  }

  // Called after the reference audio of a main sheet is saved or replaced
  static async requestAnalysis(sheetMusic: AnalysisTarget): Promise<void> {
    if (sheetMusic.kind !== 'MAIN' || !sheetMusic.referenceAudio) return;
    const jobId = crypto.randomUUID();
    const previousJobId = sheetMusic.analysisJobId;
    await SheetMusicRepository.update(sheetMusic.id, {
      analysisJobId: jobId,
      analysisError: null,
      // Students keep using the previous analysis file until the new one is ready
      ...(sheetMusic.analysisFileUrl ? {} : { analysisStatus: 'PROCESSING' })
    });
    if (previousJobId) await AnalysisService.cancelJob(previousJobId);
    await AnalysisService.queue.enqueue(jobId, { jobId, sheetMusicId: sheetMusic.id });
  }

  // Sheet no longer qualifies for analysis (became a level sheet)
  static async clearAnalysis(sheetMusicId: string, previousJobId: string | null): Promise<void> {
    await SheetMusicRepository.update(sheetMusicId, {
      analysisJobId: null,
      analysisStatus: 'NONE',
      analysisFileUrl: null,
      analysisError: null,
      timeSignatureMissing: false
    });
    if (previousJobId) await AnalysisService.cancelJob(previousJobId);
  }

  static async cancelJob(jobId: string): Promise<void> {
    await AnalysisService.queue.cancel(jobId);
    if (!EnvConfig.aiServiceUrl) return;
    // Best effort: the callback of a cancelled job is ignored anyway (job-id check)
    fetch(`${EnvConfig.aiServiceUrl}/jobs/${jobId}`, { method: 'DELETE', signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
  }

  static async dispatchJob(payload: MusicLibrary.AnalysisJobPayload): Promise<void> {
    const sheetMusic = await SheetMusicRepository.findForAnalysis(payload.sheetMusicId);
    if (!sheetMusic || sheetMusic.analysisJobId !== payload.jobId || !sheetMusic.referenceAudio) return;
    if (!EnvConfig.aiServiceUrl) throw new Error('AI_SERVICE_URL is not configured.');

    const lifetimeSec = MusicLibraryConstant.urlLifetimes.AI_SEC;
    const response = await fetch(`${EnvConfig.aiServiceUrl}/jobs/reference-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Callback-Secret': EnvConfig.aiCallbackSecret },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        jobId: payload.jobId,
        sheetMusicId: sheetMusic.id,
        audioUrl: await StorageService.driver.createReadUrl(sheetMusic.referenceAudio.storageKey, lifetimeSec),
        sheetPdfUrl: await StorageService.driver.createReadUrl(sheetMusic.sheetFile.storageKey, lifetimeSec),
        sheetMimeType: sheetMusic.sheetFile.mimeType,
        instrument: {
          code: sheetMusic.instrument.code,
          fmin: sheetMusic.instrument.fminHz,
          fmax: sheetMusic.instrument.fmaxHz,
          toleranceCents: sheetMusic.instrument.toleranceCents
        },
        callbackUrl: `${EnvConfig.publicApiUrl}/api/v1/internal/sheet-music/${sheetMusic.id}/analysis`
      })
    });
    if (!response.ok) throw new Error(`AI service responded ${response.status}`);
  }

  static async markDispatchFailed(payload: MusicLibrary.AnalysisJobPayload, _error: unknown): Promise<void> {
    const sheetMusic = await SheetMusicRepository.findForAnalysis(payload.sheetMusicId);
    if (!sheetMusic || sheetMusic.analysisJobId !== payload.jobId) return;
    await SheetMusicRepository.updateIfJobMatches(sheetMusic.id, payload.jobId, {
      analysisStatus: 'ERROR',
      analysisError: NOTIFICATIONS.DISPATCH_FAILED
    });
    await NotificationService.notifyUser(sheetMusic.piece.ownerId, {
      title: NOTIFICATIONS.ANALYSIS_ERROR,
      body: `${sheetMusic.piece.title} · ${sheetMusic.name}: ${NOTIFICATIONS.DISPATCH_FAILED}`,
      link: `/giang-vien/bai-hat/${sheetMusic.piece.id}/ban-nhac`
    });
  }

  static async handleCallback(sheetMusicId: string, callbackInput: MusicLibrary.AnalysisCallbackInput): Promise<{ isApplied: boolean }> {
    const sheetMusic = await SheetMusicRepository.findForAnalysis(sheetMusicId);
    if (!sheetMusic) throw AppError.withMessage(404, 'MSG-08', MusicLibraryConstant.messages.SHEET_NOT_FOUND);
    const jobId = callbackInput.jobId ?? sheetMusic.analysisJobId;
    if (!jobId || jobId !== sheetMusic.analysisJobId) return { isApplied: false };

    const isReady = callbackInput.status === 'READY';
    const isApplied = await SheetMusicRepository.updateIfJobMatches(sheetMusicId, jobId, isReady
      ? {
        analysisStatus: 'READY',
        analysisFileUrl: callbackInput.analysisFileUrl,
        analysisError: null,
        timeSignatureMissing: Boolean(callbackInput.timeSignatureMissing)
      }
      : { analysisStatus: 'ERROR', analysisError: callbackInput.reason || 'Không rõ lý do.' });
    if (!isApplied) return { isApplied };

    await NotificationService.notifyUser(sheetMusic.piece.ownerId, {
      title: isReady ? NOTIFICATIONS.ANALYSIS_READY : NOTIFICATIONS.ANALYSIS_ERROR,
      body: `${sheetMusic.piece.title} · ${sheetMusic.name}${isReady ? '' : `: ${callbackInput.reason || ''}`}`,
      link: `/giang-vien/bai-hat/${sheetMusic.piece.id}/ban-nhac`
    });
    return { isApplied };
  }
}
