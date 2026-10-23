import crypto from 'node:crypto';
import EnvConfig from '../../../config/EnvConfig.ts';
import NotificationService from '../../../lib/NotificationService.ts';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import TemplateAnalysisPublisherService, { type TemplateAnalysisJob } from './TemplateAnalysisPublisherService.ts';

interface AnalysisTarget {
  id: string;
  kind: MusicLibrary.SheetKind;
  referenceAudio: { id: string; storageKey: string; status: string } | null;
}

interface RhythmMetadata {
  analysisId: string;
  sheetMusicId: string;
  mediaFileId: string;
  instrumentCode: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  artifactUrl: string | null;
  error: { code: string; message: string } | null;
}

const POLL_INTERVAL_MS = 5_000;
const RESUME_INTERVAL_MS = 60_000;
const INSTRUMENT_CODE = 'dan_bau' as const;
const NOTIFICATIONS = MusicLibraryConstant.notifications;

export default class AnalysisService {
  private static readonly scheduled = new Set<string>();
  private static resumeTimer?: NodeJS.Timeout;

  static async requestAnalysis(sheetMusic: AnalysisTarget): Promise<void> {
    if (sheetMusic.kind !== 'MAIN' || !sheetMusic.referenceAudio || sheetMusic.referenceAudio.status !== 'READY') return;
    const analysisId = crypto.randomUUID();
    const job: TemplateAnalysisJob = {
      messageId: crypto.randomUUID(),
      analysisId,
      sheetMusicId: sheetMusic.id,
      mediaFileId: sheetMusic.referenceAudio.id,
      mediaUrl: StorageService.driver.createReadUrl(sheetMusic.referenceAudio.storageKey),
      instrumentCode: INSTRUMENT_CODE,
      requestedAt: new Date().toISOString()
    };
    await SheetMusicRepository.update(sheetMusic.id, {
      analysisJobId: analysisId,
      analysisStatus: 'PROCESSING',
      analysisFileUrl: null,
      analysisError: null,
      timeSignatureMissing: false
    });
    const publication = await TemplateAnalysisPublisherService.instance.publish(job);
    if (publication === 'publish_failed') {
      await SheetMusicRepository.updateIfJobMatches(sheetMusic.id, analysisId, {
        analysisStatus: 'ERROR', analysisError: NOTIFICATIONS.DISPATCH_FAILED
      });
      return;
    }
    AnalysisService.schedulePoll(sheetMusic.id, analysisId);
  }

  static start(): void {
    if (AnalysisService.resumeTimer) return;
    AnalysisService.resumeTimer = setInterval(() => { void AnalysisService.resumePending(); }, RESUME_INTERVAL_MS);
    AnalysisService.resumeTimer.unref();
    void AnalysisService.resumePending();
  }

  static stop(): void {
    if (AnalysisService.resumeTimer) clearInterval(AnalysisService.resumeTimer);
    AnalysisService.resumeTimer = undefined;
  }

  private static async resumePending(): Promise<void> {
    const pending = await SheetMusicRepository.listProcessingAnalysis().catch(() => []);
    pending.forEach((sheet) => {
      if (sheet.analysisJobId) AnalysisService.schedulePoll(sheet.id, sheet.analysisJobId);
    });
  }

  private static schedulePoll(sheetMusicId: string, analysisId: string): void {
    const key = `${sheetMusicId}:${analysisId}`;
    if (AnalysisService.scheduled.has(key)) return;
    AnalysisService.scheduled.add(key);
    const timer = setTimeout(() => {
      AnalysisService.scheduled.delete(key);
      void AnalysisService.poll(sheetMusicId, analysisId);
    }, POLL_INTERVAL_MS);
    timer.unref();
  }

  private static async poll(sheetMusicId: string, analysisId: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${EnvConfig.rhythmServiceBaseUrl}/api/v1/template-analyses/${analysisId}`, {
        headers: { Authorization: `Bearer ${EnvConfig.rhythmServiceInternalApiKey}` }, signal: AbortSignal.timeout(10_000)
      });
    } catch {
      AnalysisService.schedulePoll(sheetMusicId, analysisId);
      return;
    }
    if (response.status === 404 || response.status >= 500) {
      AnalysisService.schedulePoll(sheetMusicId, analysisId);
      return;
    }
    if (!response.ok) {
      await AnalysisService.finishError(sheetMusicId, analysisId, `Không thể kiểm tra kết quả phân tích (HTTP ${response.status}).`);
      return;
    }
    const metadata = await response.json() as RhythmMetadata;
    if (metadata.analysisId !== analysisId || metadata.sheetMusicId !== sheetMusicId || metadata.instrumentCode !== INSTRUMENT_CODE) {
      await AnalysisService.finishError(sheetMusicId, analysisId, 'Kết quả Rhythm không khớp với yêu cầu phân tích.');
      return;
    }
    if (metadata.status === 'queued' || metadata.status === 'processing') {
      AnalysisService.schedulePoll(sheetMusicId, analysisId);
      return;
    }
    if (metadata.status === 'failed') {
      await AnalysisService.finishError(sheetMusicId, analysisId, metadata.error?.message ?? 'Rhythm không thể phân tích bản thu mẫu.');
      return;
    }
    if (metadata.status !== 'completed' || !metadata.artifactUrl) {
      await AnalysisService.finishError(sheetMusicId, analysisId, 'Rhythm trả về trạng thái phân tích không hợp lệ.');
      return;
    }
    await AnalysisService.finishReady(sheetMusicId, analysisId, metadata);
  }

  private static async finishReady(sheetMusicId: string, analysisId: string, metadata: RhythmMetadata): Promise<void> {
    const sheet = await SheetMusicRepository.findForAnalysis(sheetMusicId);
    if (!sheet || sheet.analysisJobId !== analysisId || sheet.kind !== 'MAIN' || !sheet.referenceAudio || sheet.referenceAudio.id !== metadata.mediaFileId) return;
    const artifactUrl = new URL(metadata.artifactUrl!, EnvConfig.rhythmServiceBaseUrl).toString();
    let artifact: Record<string, unknown>;
    try {
      const response = await fetch(artifactUrl, {
        headers: { Authorization: `Bearer ${EnvConfig.rhythmServiceInternalApiKey}` }, signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      artifact = await response.json() as Record<string, unknown>;
    } catch {
      AnalysisService.schedulePoll(sheetMusicId, analysisId);
      return;
    }
    if (artifact.analysisId !== analysisId || artifact.sheetMusicId !== sheetMusicId || artifact.mediaFileId !== sheet.referenceAudio.id) {
      await AnalysisService.finishError(sheetMusicId, analysisId, 'File kết quả Rhythm không khớp với yêu cầu phân tích.');
      return;
    }
    const isApplied = await SheetMusicRepository.updateIfJobMatches(sheetMusicId, analysisId, {
      analysisStatus: 'READY', analysisFileUrl: artifactUrl, analysisError: null
    });
    if (isApplied) await AnalysisService.notify(sheet, true);
  }

  private static async finishError(sheetMusicId: string, analysisId: string, error: string): Promise<void> {
    const sheet = await SheetMusicRepository.findForAnalysis(sheetMusicId);
    const isApplied = await SheetMusicRepository.updateIfJobMatches(sheetMusicId, analysisId, {
      analysisStatus: 'ERROR', analysisError: error, analysisFileUrl: null
    });
    if (isApplied && sheet) await AnalysisService.notify(sheet, false, error);
  }

  private static async notify(sheet: NonNullable<Awaited<ReturnType<typeof SheetMusicRepository.findForAnalysis>>>, ready: boolean, error = ''): Promise<void> {
    await NotificationService.notifyUser(sheet.piece.ownerId, {
      title: ready ? NOTIFICATIONS.ANALYSIS_READY : NOTIFICATIONS.ANALYSIS_ERROR,
      body: `${sheet.piece.title} · ${sheet.name}${ready ? '' : `: ${error}`}`,
      link: `/giang-vien/bai-hat/${sheet.piece.id}/ban-nhac`
    });
  }

  static async clearAnalysis(sheetMusicId: string): Promise<void> {
    await SheetMusicRepository.update(sheetMusicId, {
      analysisJobId: null, analysisStatus: 'NONE', analysisFileUrl: null,
      analysisError: null, timeSignatureMissing: false
    });
  }

  // Kept for the disabled legacy callback route; template analysis now uses polling above.
  static async handleCallback(sheetMusicId: string, callbackInput: MusicLibrary.AnalysisCallbackInput): Promise<{ isApplied: boolean }> {
    const sheetMusic = await SheetMusicRepository.findForAnalysis(sheetMusicId);
    if (!sheetMusic) throw AppError.withMessage(404, 'MSG-08', MusicLibraryConstant.messages.SHEET_NOT_FOUND);
    const jobId = callbackInput.jobId ?? sheetMusic.analysisJobId;
    if (!jobId || jobId !== sheetMusic.analysisJobId) return { isApplied: false };
    const isReady = callbackInput.status === 'READY';
    const isApplied = await SheetMusicRepository.updateIfJobMatches(sheetMusicId, jobId, isReady
      ? { analysisStatus: 'READY', analysisFileUrl: callbackInput.analysisFileUrl, analysisError: null, timeSignatureMissing: Boolean(callbackInput.timeSignatureMissing) }
      : { analysisStatus: 'ERROR', analysisError: callbackInput.reason || 'Không rõ lý do.' });
    if (isApplied) await AnalysisService.notify(sheetMusic, isReady, callbackInput.reason || '');
    return { isApplied };
  }
}
