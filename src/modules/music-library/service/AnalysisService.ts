import NotificationService from '../../../lib/NotificationService.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';

interface AnalysisTarget {
  id: string;
  kind: MusicLibrary.SheetKind;
  analysisJobId: string | null;
  analysisFileUrl: string | null;
  referenceAudio: { id: string } | null;
}

const NOTIFICATIONS = MusicLibraryConstant.notifications;

// JOB-01 / JOB-02: reference-recording analysis of main sheets.
export default class AnalysisService {
  // Called after the reference audio of a main sheet is saved or replaced.
  // TODO(AI): tạm tắt gửi job. Sẽ chuyển sang Rhythm service, xếp hàng qua RabbitMQ
  // (tham khảo RhythmPublisherService của module audio). Luồng cũ cần làm lại:
  //   const jobId = crypto.randomUUID();
  //   await SheetMusicRepository.update(sheetMusic.id, {
  //     analysisJobId: jobId,
  //     analysisError: null,
  //     ...(sheetMusic.analysisFileUrl ? {} : { analysisStatus: 'PROCESSING' })
  //   });
  //   publish { jobId, sheetMusicId, audioUrl, sheetUrl, sheetMimeType,
  //             instrument: { code, fminHz, fmaxHz, toleranceCents }, callbackUrl }
  //   lỗi publish → updateIfJobMatches(..., { analysisStatus: 'ERROR', analysisError: NOTIFICATIONS.DISPATCH_FAILED })
  // Kết quả trả về áp dụng bằng handleCallback bên dưới.
  static async requestAnalysis(sheetMusic: AnalysisTarget): Promise<void> {
    if (sheetMusic.kind !== 'MAIN' || !sheetMusic.referenceAudio) return;
  }

  // Sheet no longer qualifies for analysis (became a level sheet)
  static async clearAnalysis(sheetMusicId: string): Promise<void> {
    await SheetMusicRepository.update(sheetMusicId, {
      analysisJobId: null,
      analysisStatus: 'NONE',
      analysisFileUrl: null,
      analysisError: null,
      timeSignatureMissing: false
    });
  }

  // Applies an analysis result. TODO(AI): route callback /internal/sheet-music/:id/analysis đang tắt
  // (xem MusicLibraryRoute), cần xác thực lại bằng RHYTHM_SERVICE_INTERNAL_API_KEY khi bật.
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
