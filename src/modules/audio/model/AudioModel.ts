import type { Prisma } from '@prisma/client';

export default class AudioModel {
  static readonly uploadSelect = { id: true, ownerId: true, provider: true, key: true, url: true, deletingAt: true } satisfies Prisma.AudioUploadSelect;
  static readonly requestSelect = { evaluationId: true, ownerId: true, publicationState: true } satisfies Prisma.AudioEvaluationRequestSelect;
}
