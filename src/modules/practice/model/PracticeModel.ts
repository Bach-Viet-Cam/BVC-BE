import type { Prisma } from '@prisma/client';
import TextNormalizer from '../../../utils/TextNormalizer.ts';

export default class PracticeModel {
  static readonly historySelect = {
    id: true,
    pieceId: true,
    sheetMusicId: true,
    assignmentId: true,
    status: true,
    practiceMode: true,
    accuracy: true,
    createdAt: true,
    piece: { select: { title: true } },
    assignment: { select: { type: true } }
  } satisfies Prisma.SubmissionSelect;

  // Same boundaries as the FE chips: >90, 70–90, 50–<70, <50. NULL accuracy (not analyzed) never matches.
  static readonly accuracyRangeWhere = Object.freeze({
    ABOVE_90: { accuracy: { gt: 90 } },
    '70_90': { accuracy: { gte: 70, lte: 90 } },
    '50_70': { accuracy: { gte: 50, lt: 70 } },
    BELOW_50: { accuracy: { lt: 50 } }
  } satisfies Record<Practice.HistoryAccuracyRange, Prisma.SubmissionWhereInput>);

  // Mirrors SubmissionHistoryDTO.resolveKind: ensemble first, then the linked assignment's type
  static readonly kindWhere = Object.freeze({
    ENSEMBLE: { practiceMode: 'ENSEMBLE' },
    BONUS: { practiceMode: 'SOLO', assignment: { is: { type: 'BONUS' } } },
    SOLO: { practiceMode: 'SOLO', assignment: { is: { type: { not: 'BONUS' } } } },
    PRACTICE: { practiceMode: 'SOLO', assignmentId: null }
  } satisfies Record<Practice.HistoryKind, Prisma.SubmissionWhereInput>);

  // Values inside one filter group are OR; the groups are AND
  static historyWhere(studentId: string, filter: Practice.HistoryFilter): Prisma.SubmissionWhereInput {
    const conditions: Prisma.SubmissionWhereInput[] = [];
    if (filter.pieceIds.length > 0) conditions.push({ pieceId: { in: filter.pieceIds } });
    if (filter.from || filter.to) conditions.push({ createdAt: { gte: filter.from, lte: filter.to } });
    if (filter.accuracyRanges.length > 0) conditions.push({ OR: filter.accuracyRanges.map((range) => PracticeModel.accuracyRangeWhere[range]) });
    if (filter.minAccuracy !== undefined || filter.maxAccuracy !== undefined) {
      conditions.push({ accuracy: { gte: filter.minAccuracy, lte: filter.maxAccuracy } });
    }
    if (filter.kinds.length > 0) conditions.push({ OR: filter.kinds.map((kind) => PracticeModel.kindWhere[kind]) });
    // Accent-insensitive like the library search: "ly ngua" finds "Lý ngựa ô"
    const titleTokens = TextNormalizer.toSearchTokens(filter.title);
    if (titleTokens.length > 0) {
      conditions.push({ piece: { is: { AND: titleTokens.map((token) => ({ titleNormalized: { contains: token } })) } } });
    }
    return { studentId, AND: conditions };
  }

  static readonly submissionSelect = {
    id: true,
    studentId: true,
    pieceId: true,
    sheetMusicId: true,
    assignmentId: true,
    status: true,
    practiceMode: true,
    stage: true,
    stageStartedAt: true,
    attempt: true,
    retryCount: true,
    retryAvailableAt: true,
    fileDeletedAt: true,
    fileUrl: true,
    evaluationId: true,
    messageId: true,
    publicationState: true,
    rejectReason: true,
    errorCode: true,
    errorMessage: true,
    analyzedAt: true,
    createdAt: true,
    studentUpload: { select: { id: true, key: true } }
  } satisfies Prisma.SubmissionSelect;

  static readonly sheetSelect = {
    id: true,
    pieceId: true,
    instrumentId: true,
    kind: true,
    referenceAudio: { select: { storageKey: true, status: true } },
    instrument: { select: { code: true } }
  } satisfies Prisma.SheetMusicSelect;

  static readonly contextSheetSelect = {
    id: true,
    pieceId: true,
    instrumentId: true,
    kind: true,
    name: true,
    durationSec: true,
    analysisFileUrl: true,
    referenceAudio: { select: { storageKey: true, status: true } },
    instrument: { select: { id: true, code: true, name: true } },
    level: { select: { id: true, name: true } },
    piece: { select: { id: true, title: true, bpm: true } }
  } satisfies Prisma.SheetMusicSelect;

  static readonly classAssignmentsSelect = (studentId: string) => ({
    id: true,
    title: true,
    description: true,
    status: true,
    deadline: true,
    maxSubmissions: true,
    targetBpm: true,
    currentVersionId: true,
    currentVersion: { select: { kind: true } },
    submissions: { where: { studentId }, select: { status: true } }
  }) satisfies Prisma.AssignmentSelect;
}
