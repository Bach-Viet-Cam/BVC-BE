export default class ChallengeModel {
  static readonly challengeSelect = {
    id: true,
    title: true,
    description: true,
    status: true,
    instrumentId: true,
    pieceId: true,
    createdById: true,
    startsAt: true,
    endsAt: true,
    minAccuracy: true,
    requiredBpm: true,
    maxSubmissions: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
    instrument: { select: { id: true, name: true } },
    piece: { select: { id: true, title: true } },
    classes: { select: { class: { select: { id: true, name: true } } }, orderBy: { class: { name: 'asc' as const } } }
  };

  // Main sheet fields that decide whether a piece can host a challenge.
  static readonly readySheetFilter = {
    kind: 'MAIN' as const,
    visibility: 'PUBLIC' as const,
    moderation: 'NORMAL' as const,
    referenceAudioId: { not: null },
    analysisStatus: 'READY' as const
  };
}
