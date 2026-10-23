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
    referenceAudio: { select: { storageKey: true, status: true } },
    instrument: { select: { code: true } }
  } satisfies Prisma.SheetMusicSelect;

  static readonly assignmentGateSelect = (studentId: string) => ({
    pieceId: true,
    currentVersionId: true,
    isPublished: true,
    deadline: true,
    maxSubmissions: true,
    submissions: { where: { studentId }, select: { status: true } }
  }) satisfies Prisma.AssignmentSelect;
}
