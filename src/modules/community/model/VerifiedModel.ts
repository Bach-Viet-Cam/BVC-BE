import type { Prisma } from '@prisma/client';

export default class VerifiedModel {
  static readonly sourceInclude = {
    student: { select: { id: true, username: true } },
    assignment: { include: { class: { include: { coLecturers: { select: { lecturerId: true } } } } } },
    assignmentVersion: true,
    sheetMusic: { include: { piece: true, instrument: true } },
    studentUpload: true, review: true, verifiedContent: true
  } satisfies Prisma.SubmissionInclude;
  static readonly include = {
    submission: { include: { student: { select: { id: true, username: true } } } },
    piece: true, sourceSheetMusic: true, instrument: true, sourceClass: { include: { coLecturers: { select: { lecturerId: true } } } }, audioUpload: true
  } satisfies Prisma.VerifiedContentInclude;
  static readonly publicWhere = {
    status: 'VISIBLE',
    submission: { shareConsent: true, fileDeletedAt: null, review: { status: 'APPROVED' } },
    piece: { visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null },
    sourceSheetMusic: { visibility: 'PUBLIC', moderation: 'NORMAL' },
    instrument: { isActive: true },
    audioUpload: { deletingAt: null }
  } satisfies Prisma.VerifiedContentWhereInput;
}
