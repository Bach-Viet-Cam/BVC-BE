import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import ClassModel from '../model/ClassModel.ts';

export default class ClassRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static buildListWhere(lecturerId: string, query: Backend.ClassListQuery): Prisma.ClassWhereInput {
    return {
      ownerId: lecturerId,
      ...(query.status !== 'ALL' ? { status: query.status } : {}),
      ...(query.cohort ? { cohort: query.cohort } : {}),
      ...(query.instrumentId ? { instrumentId: query.instrumentId } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {})
    };
  }

  static async findClasses(lecturerId: string, query: Backend.ClassListQuery): Promise<{ classes: Backend.ClassRecord[]; total: number }> {
    const where = ClassRepository.buildListWhere(lecturerId, query);
    const [classes, total] = await ClassRepository.client.$transaction([
      ClassRepository.client.class.findMany({
        where,
        select: ClassModel.classSelect,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      ClassRepository.client.class.count({ where })
    ]);
    return { classes: classes as Backend.ClassRecord[], total };
  }

  static async countActiveClasses(lecturerId: string): Promise<number> {
    return ClassRepository.client.class.count({ where: { ownerId: lecturerId, status: 'ACTIVE' } });
  }

  static async findCohorts(lecturerId: string): Promise<string[]> {
    const cohorts = await ClassRepository.client.class.findMany({
      where: { ownerId: lecturerId },
      distinct: ['cohort'],
      select: { cohort: true },
      orderBy: { cohort: 'desc' }
    });
    return cohorts.map((cohortRow) => cohortRow.cohort);
  }

  static async findClassById(classId: string): Promise<Backend.ClassRecord | null> {
    const classRecord = await ClassRepository.client.class.findUnique({ where: { id: classId }, select: ClassModel.classSelect });
    return classRecord as Backend.ClassRecord | null;
  }

  static async findClassByCohortAndName(cohort: string, name: string, excludedClassId?: string): Promise<{ id: string } | null> {
    return ClassRepository.client.class.findFirst({
      where: {
        cohort,
        name: { equals: name, mode: 'insensitive' },
        ...(excludedClassId ? { id: { not: excludedClassId } } : {})
      },
      select: { id: true }
    });
  }

  static async findInstrumentById(instrumentId: string): Promise<Backend.InstrumentDTO | null> {
    return ClassRepository.client.instrument.findUnique({
      where: { id: instrumentId },
      select: { id: true, name: true, isActive: true }
    });
  }

  static async createClass(lecturerId: string, data: Backend.ClassWriteData, client: Prisma.TransactionClient = ClassRepository.client): Promise<Backend.ClassRecord> {
    const classRecord = await client.class.create({ data: { ...data, ownerId: lecturerId }, select: ClassModel.classSelect });
    return classRecord as Backend.ClassRecord;
  }

  static async updateClass(classId: string, data: Partial<Backend.ClassWriteData>, client: Prisma.TransactionClient = ClassRepository.client): Promise<Backend.ClassRecord> {
    const classRecord = await client.class.update({ where: { id: classId }, data, select: ClassModel.classSelect });
    return classRecord as Backend.ClassRecord;
  }

  static async markClassFinished(classId: string, endedAt: Date, client: Prisma.TransactionClient = ClassRepository.client): Promise<Backend.ClassRecord> {
    const classRecord = await client.class.update({
      where: { id: classId },
      data: { status: 'ENDED', endedAt },
      select: ClassModel.classSelect
    });
    return classRecord as Backend.ClassRecord;
  }
}
