export interface PieceAvailability {
  visibility: 'PUBLIC' | 'HIDDEN';
  moderation: 'NORMAL' | 'ADMIN_HIDDEN';
  deletedAt: Date | null;
}

export default class EnsemblePolicyService {
  // Free practice follows the public library; an assignment may use a piece its lecturer keeps hidden,
  // but never one hidden by an admin or deleted
  static canPracticePiece(input: { piece: PieceAvailability; isViaAssignment: boolean }): boolean {
    if (input.piece.deletedAt || input.piece.moderation === 'ADMIN_HIDDEN') return false;
    return input.isViaAssignment || input.piece.visibility === 'PUBLIC';
  }

  static filterTracks<TTrack extends { instrumentId: string }>(input: { tracks: TTrack[]; studentInstrumentId: string }): TTrack[] {
    // Trả đủ các bè để nghe mẫu; trình phát chỉ tắt bè của sinh viên trong lúc thu.
    return input.tracks;
  }

  static resolveTargetBpm(input: { assignmentBpm: number | null; pieceBpm: number }): number {
    return input.assignmentBpm ?? input.pieceBpm;
  }

  // GBR-25: an ensemble take counts only toward an ENSEMBLE assignment that is OPEN, the state the practice submission
  // uses (class active, assignment published, before its deadline and with attempts left)
  static isCountedAssignment(input: { kind: Backend.AssignmentKind | null | undefined; state: Practice.AssignmentState }): boolean {
    return input.kind === 'ENSEMBLE' && input.state === 'OPEN';
  }
}
