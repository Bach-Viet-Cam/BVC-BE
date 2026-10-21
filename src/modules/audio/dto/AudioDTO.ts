export default class AudioDTO {
  upload(record: { id: string; url: string }): { fileId: string; url: string } {
    return { fileId: record.id, url: record.url };
  }

  pending(evaluationId: string, status: Audio.EvaluationStatus): Audio.EvaluationResponse {
    return { evaluationId, status, result: null, error: null };
  }
}
