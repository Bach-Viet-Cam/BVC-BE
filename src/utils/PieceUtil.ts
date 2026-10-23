// A piece is selectable / shown to students only while it is public, not hidden by an admin and not deleted.
export default class PieceUtil {
  static isAvailable(piece: { visibility: string; moderation: string; deletedAt: Date | null }): boolean {
    return piece.visibility === 'PUBLIC' && piece.moderation === 'NORMAL' && piece.deletedAt === null;
  }

  // A sheet music is usable only while it is public, not hidden by an admin and its piece is available.
  static isSheetMusicAvailable(sheet: { visibility: string; moderation: string; piece: { visibility: string; moderation: string; deletedAt: Date | null } }): boolean {
    return sheet.visibility === 'PUBLIC' && sheet.moderation === 'NORMAL' && PieceUtil.isAvailable(sheet.piece);
  }
}
