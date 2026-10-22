import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import ChallengeModel from '../model/ChallengeModel.ts';

interface ChallengeWriteData {
  title?: string;
  description?: string | null;
  instrumentId?: string | null;
  pieceId?: string | null;
  sheetMusicId?: string | null;
  status?: Backend.ChallengeStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  minAccuracy?: number | null;
  requiredBpm?: number | null;
  maxSubmissions?: number;
  publishedAt?: Date | null;
}

export default class ChallengeRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findById(challengeId: string, client: Prisma.TransactionClient = ChallengeRepository.client): Promise<Backend.ChallengeRecord | null> {
    const record = await client.challenge.findUnique({ where: { id: challengeId }, select: ChallengeModel.challengeSelect });
    return record as Backend.ChallengeRecord | null;
  }

  static async findByLecturer(lecturerId: string, query: Backend.ChallengeListQuery): Promise<{ records: Backend.ChallengeRecord[]; total: number }> {
    const where: Prisma.ChallengeWhereInput = { createdById: lecturerId };
    const [records, total] = await ChallengeRepository.client.$transaction([
      ChallengeRepository.client.challenge.findMany({
        where,
        select: ChallengeModel.challengeSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      ChallengeRepository.client.challenge.count({ where })
    ]);
    return { records: records as Backend.ChallengeRecord[], total };
  }

  static async create(createdById: string, data: ChallengeWriteData & { title: string }, classIds: string[], client: Prisma.TransactionClient): Promise<{ id: string }> {
    return client.challenge.create({
      data: { ...data, createdById, classes: { create: classIds.map((classId) => ({ classId })) } },
      select: { id: true }
    });
  }

  // Writes only while the row is still a DRAFT; false means it was published (or removed) meanwhile.
  static async update(challengeId: string, data: ChallengeWriteData, classIds: string[] | undefined, client: Prisma.TransactionClient): Promise<boolean> {
    const result = await client.challenge.updateMany({ where: { id: challengeId, status: 'DRAFT' }, data });
    if (result.count === 0) return false;
    if (classIds) {
      await client.challengeClass.deleteMany({ where: { challengeId } });
      await client.challengeClass.createMany({ data: classIds.map((classId) => ({ challengeId, classId })) });
    }
    return true;
  }

  static async delete(challengeId: string, client: Prisma.TransactionClient): Promise<boolean> {
    const result = await client.challenge.deleteMany({ where: { id: challengeId, status: 'DRAFT' } });
    return result.count > 0;
  }

  // Row lock so a concurrent PATCH / DELETE waits for this publish and then sees PUBLISHED.
  static async lockChallenge(challengeId: string, client: Prisma.TransactionClient): Promise<void> {
    await client.$queryRaw`SELECT id FROM challenges WHERE id = ${challengeId} FOR UPDATE`;
  }

  static async findClassForChallenge(classId: string, client: Prisma.TransactionClient | typeof PrismaClientProvider.instance) {
    return client.class.findUnique({ where: { id: classId }, select: { id: true, name: true, instrumentId: true, ownerId: true, status: true } });
  }

  // Serialises publishes of one lecturer so the overlap check cannot race with a concurrent publish.
  static async lockLecturer(lecturerId: string, client: Prisma.TransactionClient): Promise<void> {
    const lockKey = `challenge:${lecturerId}`;
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }

  static async findOverlappingClassIds(
    data: { lecturerId: string; instrumentId: string; classIds: string[]; startsAt: Date; endsAt: Date; excludeChallengeId?: string },
    client: Prisma.TransactionClient
  ): Promise<string[]> {
    const rows = await client.challengeClass.findMany({
      where: {
        classId: { in: data.classIds },
        challenge: {
          status: 'PUBLISHED',
          createdById: data.lecturerId,
          instrumentId: data.instrumentId,
          startsAt: { lte: data.endsAt },
          endsAt: { gte: data.startsAt },
          ...(data.excludeChallengeId ? { id: { not: data.excludeChallengeId } } : {})
        }
      },
      select: { classId: true }
    });
    return rows.map((row) => row.classId);
  }

  static async findPieceForChallenge(pieceId: string, instrumentId: string | null, client: Prisma.TransactionClient | typeof PrismaClientProvider.instance = ChallengeRepository.client) {
    return client.piece.findUnique({
      where: { id: pieceId },
      select: {
        visibility: true,
        moderation: true,
        deletedAt: true,
        instruments: { select: { instrumentId: true } },
        sheetMusic: {
          where: { kind: 'MAIN', ...(instrumentId ? { mainInstrumentId: instrumentId } : {}) },
          select: { id: true, visibility: true, moderation: true, referenceAudioId: true, analysisStatus: true }
        }
      }
    });
  }

  static async findReadyPieces(query: Backend.ChallengePieceQuery): Promise<Backend.ChallengePieceDTO[]> {
    return ChallengeRepository.client.piece.findMany({
      where: {
        visibility: 'PUBLIC',
        moderation: 'NORMAL',
        deletedAt: null,
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
        sheetMusic: { some: { ...ChallengeModel.readySheetFilter, ...(query.instrumentId ? { mainInstrumentId: query.instrumentId } : {}) } }
      },
      select: { id: true, title: true, composer: true, kind: true, bpm: true },
      orderBy: [{ titleNormalized: 'asc' }, { id: 'asc' }],
      take: 50
    });
  }
}
