import PieceUtil from '../../../utils/PieceUtil.ts';

export default class AssignmentDTO {
  static toBaseDTO(record: Backend.AssignmentRecord): Backend.AssignmentBaseDTO {
    const version = record.currentVersion;
    if (!version) throw new Error(`Assignment ${record.id} has no current version`);
    const sheet = version.sheetMusic;
    const sheetMusic = sheet
      ? {
          id: sheet.id,
          name: sheet.name,
          pieceId: sheet.piece.id,
          pieceTitle: sheet.piece.title,
          defaultBpm: sheet.piece.bpm,
          isAvailable: PieceUtil.isSheetMusicAvailable(sheet)
        }
      : null;
    return {
      id: record.id,
      classId: record.classId,
      className: record.class.name,
      classStatus: record.class.status,
      status: record.status,
      version: version.version,
      title: version.title,
      description: version.description,
      kind: version.kind,
      sheetMusic,
      requiredBpm: version.requiredBpm,
      effectiveBpm: version.requiredBpm ?? sheetMusic?.defaultBpm ?? null,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      closedAt: record.closedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
