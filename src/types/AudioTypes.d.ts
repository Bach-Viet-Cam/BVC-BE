declare namespace Audio {
  type PublicationState = 'publishing' | 'published' | 'publish_failed' | 'publish_unknown';
  type EvaluationStatus = 'queued' | 'processing' | 'waiting' | 'completed' | 'failed' | 'rejected' | PublicationState;
  type JobCode = 'quality_check' | 'audio_analysis' | 'comparison' | 'feedback';
  interface EvaluationInput { templateUrl: string; studentUrl: string; }
  interface Job extends EvaluationInput { messageId: string; evaluationId: string; instrumentId: string; requestedAt: string; attempt?: number; callbackUrl?: string; templateAnalysisId?: string; }
  interface Result { overallScore: number; pitchAccuracyPercent: number; rhythmAccuracyPercent: number; aiFeedback: string; [key: string]: unknown; }
  interface EvaluationResponse { evaluationId: string; status: EvaluationStatus; stage?: JobCode | null; attempt?: number; result: Result | null; error: { code: string; message: string } | null; }
}
