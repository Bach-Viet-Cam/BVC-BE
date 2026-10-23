import type { Prisma } from '@prisma/client';

export default class PracticeModel {
  static readonly submissionSelect = {
    id: true,
    studentId: true,
    pieceId: true,
    sheetMusicId: true,
    assignmentId: true,
    status: true,
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
    submissions: { where: { studentId }, select: { status: true } }
  }) satisfies Prisma.AssignmentSelect;
}
