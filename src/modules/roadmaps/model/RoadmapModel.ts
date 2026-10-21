export default class RoadmapModel {
  static readonly instrumentSelect = { id: true, name: true };

  static readonly roadmapSelect = {
    id: true,
    version: true,
    createdAt: true,
    instrument: { select: RoadmapModel.instrumentSelect },
    weeks: {
      orderBy: { weekNumber: 'asc' as const },
      select: {
        weekNumber: true,
        title: true,
        content: true,
        exercises: {
          orderBy: { sortOrder: 'asc' as const },
          select: { piece: { select: { id: true, title: true, visibility: true, moderation: true, deletedAt: true } } }
        }
      }
    }
  };

  static readonly pieceSnapshotSelect = {
    id: true,
    title: true,
    kind: true,
    visibility: true,
    moderation: true,
    deletedAt: true,
    instruments: { select: { instrumentId: true } }
  };

  static readonly fingerExerciseSelect = { id: true, title: true, bpm: true };
}
