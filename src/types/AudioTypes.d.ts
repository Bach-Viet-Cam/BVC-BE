declare namespace Audio {
  type PublicationState = 'publishing' | 'published' | 'publish_failed' | 'publish_unknown';
  type EvaluationStatus = 'queued' | 'processing' | 'completed' | 'failed' | PublicationState;
  interface EvaluationInput { templateUrl: string; studentUrl: string; }
  interface Job extends EvaluationInput { messageId: string; evaluationId: string; instrumentId: string; requestedAt: string; }
  interface Result { overallScore: number; pitchAccuracyPercent: number; rhythmAccuracyPercent: number; aiFeedback: string; }
  interface EvaluationResponse { evaluationId: string; status: EvaluationStatus; result: Result | null; error: { code: string; message: string } | null; }
}
