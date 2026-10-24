export default class SubmissionHistoryDTO {
  // Mirrors PracticeModel.kindWhere so a filtered row always shows the kind it was filtered by
  static resolveKind(record: Pick<Practice.HistoryRecord, 'practiceMode' | 'assignment'>): Practice.HistoryKind {
    if (record.practiceMode === 'ENSEMBLE') return 'ENSEMBLE';
    if (!record.assignment) return 'PRACTICE';
    return record.assignment.type === 'BONUS' ? 'BONUS' : 'SOLO';
  }

  toItem(record: Practice.HistoryRecord): Practice.HistoryItemDTO {
    return {
      id: record.id,
      pieceId: record.pieceId,
      pieceTitle: record.piece.title,
      sheetMusicId: record.sheetMusicId,
      assignmentId: record.assignmentId,
      status: record.status,
      kind: SubmissionHistoryDTO.resolveKind(record),
      accuracy: record.accuracy,
      submittedAt: record.createdAt.toISOString()
    };
  }

  toOverall(countByStatus: Partial<Record<Practice.SubmissionStatus, number>>): Practice.HistoryOverall {
    const completed = countByStatus.COMPLETED ?? 0;
    const processing = countByStatus.PROCESSING ?? 0;
    const rejected = countByStatus.REJECTED ?? 0;
    const failed = countByStatus.FAILED ?? 0;
    return { total: completed + processing + rejected + failed, completed, processing, rejected, failed };
  }
}
