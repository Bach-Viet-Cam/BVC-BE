import PracticeConstant from '../constant/PracticeConstant.ts';

export default class PracticeSubmissionDTO {
  toResponse(record: Practice.SubmissionRecord): Practice.SubmissionDTO {
    return {
      id: record.id,
      pieceId: record.pieceId,
      sheetMusicId: record.sheetMusicId,
      assignmentId: record.assignmentId,
      status: record.status,
      practiceMode: record.practiceMode,
      stage: record.stage,
      stageStartedAt: record.stageStartedAt?.toISOString() ?? null,
      retryCount: record.retryCount,
      maxRetries: PracticeConstant.maxRetries,
      retryAvailableAt: record.retryAvailableAt?.toISOString() ?? null,
      isFileDeleted: Boolean(record.fileDeletedAt),
      rejectReason: record.rejectReason,
      errorMessage: record.errorMessage,
      analyzedAt: record.analyzedAt?.toISOString() ?? null,
      submittedAt: record.createdAt.toISOString()
    };
  }
}
