import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import ClassModel from '../model/ClassModel.ts';

export default class MemberRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static buildMemberWhere(classId: string, query: Backend.MemberListQuery): Prisma.ClassMemberWhereInput {
    const studentFilters: Prisma.UserWhereInput[] = [];
    if (query.accountStatus !== 'ALL') studentFilters.push({ status: query.accountStatus });
    if (query.q) {
      studentFilters.push({
        OR: [
          { username: { contains: query.q, mode: 'insensitive' } },
          { studentCode: { contains: query.q, mode: 'insensitive' } }
        ]
      });
    }
    return {
      classId,
      ...ClassModel.activeMemberFilter,
      ...(studentFilters.length ? { user: { AND: studentFilters } } : {})
    };
  }

  static async findMembers(classId: string, query: Backend.MemberListQuery): Promise<{ members: Backend.MemberRecord[]; total: number; totalMembers: number }> {
    const where = MemberRepository.buildMemberWhere(classId, query);
    const [members, total, totalMembers] = await MemberRepository.client.$transaction([
      MemberRepository.client.classMember.findMany({
        where,
        select: ClassModel.memberSelect,
        orderBy: [{ user: { username: 'asc' } }],
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      MemberRepository.client.classMember.count({ where }),
      MemberRepository.client.classMember.count({ where: { classId, ...ClassModel.activeMemberFilter } })
    ]);
    return { members: members as Backend.MemberRecord[], total, totalMembers };
  }

  static async findUserByEmail(email: string, client: Prisma.TransactionClient = MemberRepository.client): Promise<(Backend.ExistingUserSnapshot & { username: string }) | null> {
    return client.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { ...ClassModel.existingUserSelect, username: true }
    });
  }

  static async findActiveMembership(classId: string, studentId: string, client: Prisma.TransactionClient = MemberRepository.client): Promise<Backend.MemberRecord | null> {
    const member = await client.classMember.findFirst({
      where: { classId, userId: studentId, ...ClassModel.activeMemberFilter },
      select: ClassModel.memberSelect
    });
    return member as Backend.MemberRecord | null;
  }

  static async findActiveMemberIds(classId: string, client: Prisma.TransactionClient = MemberRepository.client): Promise<Set<string>> {
    const members = await client.classMember.findMany({
      where: { classId, ...ClassModel.activeMemberFilter },
      select: { userId: true }
    });
    return new Set(members.map((member) => member.userId));
  }

  static async findUsersByEmailsOrCodes(
    emails: string[],
    studentCodes: string[],
    client: Prisma.TransactionClient = MemberRepository.client
  ): Promise<Backend.ExistingUserSnapshot[]> {
    return client.user.findMany({
      where: {
        OR: [
          { email: { in: emails, mode: 'insensitive' } },
          { studentCode: { in: studentCodes, mode: 'insensitive' } }
        ]
      },
      select: ClassModel.existingUserSelect
    });
  }

  static async createPendingStudent(row: Backend.StudentRowInput, studentRole: Backend.UserRole, client: Prisma.TransactionClient): Promise<{ id: string }> {
    return client.user.create({
      data: { email: row.email, username: row.fullName, role: studentRole, status: 'PENDING', studentCode: row.studentCode },
      select: { id: true }
    });
  }

  static async setStudentCode(userId: string, studentCode: string, client: Prisma.TransactionClient): Promise<void> {
    await client.user.update({ where: { id: userId }, data: { studentCode } });
  }

  static async createMembers(
    memberships: Array<{ classId: string; studentId: string; instrumentId: string; source: 'IMPORT' | 'MANUAL'; addedById: string; importLogId?: string }>,
    client: Prisma.TransactionClient
  ): Promise<number> {
    const result = await client.classMember.createMany({
      data: memberships.map(({ studentId, ...membership }) => ({ ...membership, userId: studentId }))
    });
    return result.count;
  }

  static async softRemoveMember(memberId: string, removedById: string, client: Prisma.TransactionClient = MemberRepository.client): Promise<void> {
    await client.classMember.update({ where: { id: memberId }, data: { removedAt: new Date(), removedById } });
  }
}
