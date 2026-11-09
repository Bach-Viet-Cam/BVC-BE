import type { Prisma } from '@prisma/client';

export default class ClassModel {
  static readonly activeMemberFilter = { removedAt: null };

  static readonly coLecturerSelect = { lecturerId: true };

  static readonly lecturerSelect = { id: true, username: true, email: true };

  static lecturerClassFilter(userId: string): Prisma.ClassWhereInput {
    return { OR: [{ ownerId: userId }, { coLecturers: { some: { lecturerId: userId } } }] };
  }

  static readonly classSelect = {
    id: true,
    name: true,
    cohort: true,
    description: true,
    instrumentId: true,
    ownerId: true,
    startDate: true,
    endDate: true,
    status: true,
    endedAt: true,
    roadmapId: true,
    createdAt: true,
    instrument: { select: { id: true, name: true } },
    owner: { select: ClassModel.lecturerSelect },
    coLecturers: {
      select: { lecturerId: true, lecturer: { select: ClassModel.lecturerSelect } },
      orderBy: { createdAt: 'asc' as const }
    },
    _count: { select: { members: { where: ClassModel.activeMemberFilter } } }
  };

  static readonly memberSelect = {
    id: true,
    joinedAt: true,
    user: { select: { id: true, username: true, email: true, studentCode: true, status: true } }
  };

  static readonly existingUserSelect = { id: true, email: true, studentCode: true, role: true };

  static readonly importLogSelect = {
    id: true,
    classId: true,
    lecturerId: true,
    fileName: true,
    status: true,
    totalRows: true,
    rows: true
  };
}
