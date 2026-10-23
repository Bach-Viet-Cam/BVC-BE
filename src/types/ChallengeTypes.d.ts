declare namespace Backend {
  type ChallengeStatus = 'DRAFT' | 'PUBLISHED';
  type ChallengeDisplayStatus = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'ENDED';

  interface ChallengeInput {
    title: string;
    description: string | null;
    instrumentId: string | null;
    pieceId: string | null;
    classIds: string[];
    weekStart: string | null;
    minAccuracy: number | null;
    requiredBpm: number | null;
    maxSubmissions: number;
    publish: boolean;
  }

  // Fields of a PATCH; a missing key keeps the stored value, null clears it.
  interface ChallengePatchInput {
    title?: string;
    description?: string | null;
    instrumentId?: string | null;
    pieceId?: string | null;
    classIds?: string[];
    weekStart?: string | null;
    minAccuracy?: number | null;
    requiredBpm?: number | null;
    maxSubmissions?: number;
  }

  interface ChallengeCreateBody {
    title: string;
    description?: string | null;
    instrumentId?: string | null;
    pieceId?: string | null;
    classIds?: string[];
    weekStart?: string | null;
    minAccuracy?: number | null;
    requiredBpm?: number | null;
    maxSubmissions?: number;
    publish: boolean;
  }

  interface ChallengeListQuery{ page: number; limit: number; }
  interface ChallengePieceQuery { instrumentId?: string; q?: string; }

  interface ChallengeRecord {
    id: string;
    title: string;
    description: string | null;
    status: ChallengeStatus;
    instrumentId: string | null;
    pieceId: string | null;
    createdById: string;
    startsAt: Date | null;
    endsAt: Date | null;
    minAccuracy: number | null;
    requiredBpm: number | null;
    maxSubmissions: number;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    instrument: { id: string; name: string } | null;
    piece: { id: string; title: string } | null;
    classes: Array<{ class: { id: string; name: string } }>;
  }

  interface ChallengeDTO {
    id: string;
    title: string;
    description: string | null;
    status: ChallengeStatus;
    displayStatus: ChallengeDisplayStatus;
    instrument: { id: string; name: string } | null;
    piece: { id: string; title: string } | null;
    classes: Array<{ id: string; name: string }>;
    weekStart: string | null;
    startsAt: string | null;
    endsAt: string | null;
    minAccuracy: number | null;
    requiredBpm: number | null;
    maxSubmissions: number;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }

  interface ChallengePieceDTO { id: string; title: string; composer: string | null; kind: string; bpm: number; }
  interface ChallengeFormMeta { defaultMinAccuracy: number; maxSubmissionsDefault: number; }
}
