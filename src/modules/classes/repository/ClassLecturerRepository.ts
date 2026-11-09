import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassModel from '../model/ClassModel.ts';

export default class ClassLecturerRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  // A lecturer account that can be added to a class: role teacher, not locked (PENDING is allowed).
  static readonly assignableFilter = { role: AuthConstant.roles.TEACHER, status: { not: 'LOCKED' as const } };

  static async findAssignableLecturers(ids: string[]): Promise<Array<{ id: string }>> {
    return ClassLecturerRepository.client.user.findMany({
      where: { id: { in: ids }, ...ClassLecturerRepository.assignableFilter },
      select: { id: true }
    });
  }

  static async searchLecturersByEmail(email: string, excludedId: string): Promise<Array<{ id: string; username: string; email: string }>> {
    return ClassLecturerRepository.client.user.findMany({
      where: {
        email: { contains: email, mode: 'insensitive' },
        id: { not: excludedId },
        ...ClassLecturerRepository.assignableFilter
      },
      select: ClassModel.lecturerSelect,
      orderBy: { email: 'asc' },
      take: ClassConstant.limits.LECTURER_LOOKUP_MAX
    });
  }

  static async create(
    classId: string,
    lecturerId: string,
    addedById: string,
    client: Prisma.TransactionClient = ClassLecturerRepository.client
  ): Promise<{ id: string; username: string; email: string }> {
    const created = await client.classLecturer.create({
      data: { classId, lecturerId, addedById },
      select: { lecturer: { select: ClassModel.lecturerSelect } }
    });
    return created.lecturer;
  }

  static async deleteByLecturer(
    classId: string,
    lecturerId: string,
    client: Prisma.TransactionClient = ClassLecturerRepository.client
  ): Promise<number> {
    const result = await client.classLecturer.deleteMany({ where: { classId, lecturerId } });
    return result.count;
  }

  static async createMany(
    classId: string,
    lecturerIds: string[],
    addedById: string,
    client: Prisma.TransactionClient = ClassLecturerRepository.client
  ): Promise<void> {
    if (lecturerIds.length === 0) return;
    await client.classLecturer.createMany({ data: lecturerIds.map((lecturerId) => ({ classId, lecturerId, addedById })) });
  }
}
