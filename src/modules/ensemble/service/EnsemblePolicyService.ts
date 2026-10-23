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
    return input.tracks.filter((track) => track.instrumentId !== input.studentInstrumentId);
  }

  static resolveTargetBpm(input: { assignmentBpm: number | null; pieceBpm: number }): number {
    return input.assignmentBpm ?? input.pieceBpm;
  }
}
