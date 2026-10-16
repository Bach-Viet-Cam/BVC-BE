export default class AssignmentDTO {
  static toBaseDTO(record: Backend.AssignmentRecord): Backend.AssignmentBaseDTO {
    const version = record.currentVersion;
    if (!version) throw new Error(`Assignment ${record.id} has no current version`);
    const piece = version.piece
      ? { id: version.piece.id, title: version.piece.title, defaultBpm: version.piece.defaultBpm, isAvailable: version.piece.isVisible }
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
      piece,
      requiredBpm: version.requiredBpm,
      effectiveBpm: version.requiredBpm ?? piece?.defaultBpm ?? null,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      closedAt: record.closedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
