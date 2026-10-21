import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PieceUtil from '../../../utils/PieceUtil.ts';
import RoadmapModel from '../model/RoadmapModel.ts';

export default class RoadmapRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findActiveInstrumentsWithLatestVersion(): Promise<Array<{ id: string; name: string; roadmaps: Array<{ version: number; createdAt: Date }> }>> {
    return RoadmapRepository.client.instrument.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, roadmaps: { orderBy: { version: 'desc' }, take: 1, select: { version: true, createdAt: true } } }
    });
  }

  static async findActiveInstrument(instrumentId: string): Promise<{ id: string; name: string } | null> {
    return RoadmapRepository.client.instrument.findFirst({ where: { id: instrumentId, isActive: true }, select: RoadmapModel.instrumentSelect });
  }

  static async findLatestRoadmap(instrumentId: string): Promise<Backend.RoadmapRecord | null> {
    return RoadmapRepository.client.roadmap.findFirst({
      where: { instrumentId },
      orderBy: { version: 'desc' },
      select: RoadmapModel.roadmapSelect
    });
  }

  static async findRoadmapById(roadmapId: string, client: Prisma.TransactionClient = RoadmapRepository.client): Promise<Backend.RoadmapRecord | null> {
    return client.roadmap.findUnique({ where: { id: roadmapId }, select: RoadmapModel.roadmapSelect });
  }

  static async findLatestRoadmapId(instrumentId: string, client: Prisma.TransactionClient = RoadmapRepository.client): Promise<string | null> {
    const roadmap = await client.roadmap.findFirst({ where: { instrumentId }, orderBy: { version: 'desc' }, select: { id: true } });
    return roadmap?.id ?? null;
  }

  static async findPiecesByIds(pieceIds: string[]): Promise<Backend.PieceSnapshot[]> {
    if (pieceIds.length === 0) return [];
    const pieces = await RoadmapRepository.client.piece.findMany({ where: { id: { in: pieceIds } }, select: RoadmapModel.pieceSnapshotSelect });
    return pieces.map((piece) => ({
      id: piece.id,
      title: piece.title,
      kind: piece.kind,
      instrumentIds: piece.instruments.map((instrument) => instrument.instrumentId),
      isAvailable: PieceUtil.isAvailable(piece)
    }));
  }

  static async findFingerExercises(instrumentId: string, query?: string): Promise<Backend.FingerExerciseDTO[]> {
    const exercises = await RoadmapRepository.client.piece.findMany({
      where: {
        instruments: { some: { instrumentId } },
        kind: 'FINGER_EXERCISE',
        visibility: 'PUBLIC',
        moderation: 'NORMAL',
        deletedAt: null,
        ...(query ? { title: { contains: query, mode: 'insensitive' as const } } : {})
      },
      orderBy: { title: 'asc' },
      select: RoadmapModel.fingerExerciseSelect
    });
    return exercises.map((exercise) => ({ id: exercise.id, title: exercise.title, defaultBpm: exercise.bpm }));
  }

  static async findMaxVersion(instrumentId: string, client: Prisma.TransactionClient): Promise<number> {
    const result = await client.roadmap.aggregate({ where: { instrumentId }, _max: { version: true } });
    return result._max.version ?? 0;
  }

  static async createRoadmapVersion(
    data: { instrumentId: string; version: number; createdById: string; weeks: Backend.RoadmapWeekInput[] },
    client: Prisma.TransactionClient
  ): Promise<{ id: string }> {
    return client.roadmap.create({
      data: {
        instrumentId: data.instrumentId,
        version: data.version,
        createdById: data.createdById,
        weeks: {
          create: data.weeks.map((week) => ({
            weekNumber: week.weekNumber,
            title: week.title,
            content: week.content,
            exercises: { create: week.exerciseIds.map((pieceId, sortOrder) => ({ pieceId, sortOrder })) }
          }))
        }
      },
      select: { id: true }
    });
  }

  // Q4: classes created before the instrument had any roadmap get the new version; only ACTIVE ones.
  static async backfillActiveClasses(instrumentId: string, roadmapId: string, client: Prisma.TransactionClient): Promise<number> {
    const result = await client.class.updateMany({
      where: { instrumentId, roadmapId: null, status: 'ACTIVE' },
      data: { roadmapId }
    });
    return result.count;
  }
}
