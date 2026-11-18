import type { Prisma } from '@prisma/client';

export default class AiRatingModel {
  static readonly sourceInclude = { assignment: { include: { class: { include: { coLecturers: { select: { lecturerId: true } } } } } } } satisfies Prisma.SubmissionInclude;
  static readonly ratingSelect = { id: true, accuracyStars: true, satisfactionStars: true, comment: true, updatedAt: true } satisfies Prisma.AiFeedbackRatingSelect;
  static readonly historyInclude = { submission: { select: { id: true, createdAt: true, student: { select: { username: true } }, piece: { select: { title: true } }, assignment: { select: { title: true } } } } } satisfies Prisma.AiFeedbackRatingInclude;
}
