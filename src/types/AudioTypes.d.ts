declare namespace Audio {
  type PublicationState = 'publishing' | 'published' | 'publish_failed' | 'publish_unknown';
  type EvaluationStatus = 'queued' | 'processing' | 'waiting' | 'completed' | 'failed' | 'rejected' | PublicationState;
  type JobCode = 'quality_check' | 'audio_analysis' | 'comparison' | 'feedback';
  interface EvaluationInput { templateUrl: string; studentUrl: string; }
  // Thông số nhạc cụ lấy từ bảng Instrument, gửi kèm mỗi job để Rhythm không phải tự tra bảng riêng
  interface InstrumentConfig { name: string; fminHz: number; fmaxHz: number; toleranceCents: number; }
  interface Job extends EvaluationInput { messageId: string; evaluationId: string; instrumentId: string; instrument: InstrumentConfig; requestedAt: string; attempt?: number; callbackUrl?: string; templateAnalysisId?: string; templateStartSec?: number; templateEndSec?: number; baselineEvaluationId?: string; }
  interface Result { overallScore: number; pitchAccuracyPercent: number; rhythmAccuracyPercent: number; aiFeedback: string;[key: string]: unknown; }
  interface EvaluationResponse { evaluationId: string; status: EvaluationStatus; stage?: JobCode | null; attempt?: number; result: Result | null; error: { code: string; message: string } | null; }
}
