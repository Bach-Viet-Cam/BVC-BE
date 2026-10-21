// A piece is selectable / shown to students only while it is public, not hidden by an admin and not deleted.
export default class PieceUtil {
  static isAvailable(piece: { visibility: string; moderation: string; deletedAt: Date | null }): boolean {
    return piece.visibility === 'PUBLIC' && piece.moderation === 'NORMAL' && piece.deletedAt === null;
  }
}
