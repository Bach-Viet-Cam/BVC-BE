import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import UserModel from '../model/UserModel.ts';

export default class UserRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static buildWhere(query: Backend.UserListQuery): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (query.role !== undefined) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { username: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { studentCode: { contains: query.q, mode: 'insensitive' } }
      ];
    }
    return where;
  }

  static async list(query: Backend.UserListQuery): Promise<{ items: Backend.UserAdminRecord[]; total: number }> {
    const where = UserRepository.buildWhere(query);
    const [items, total] = await Promise.all([
      UserRepository.client.user.findMany({
        where,
        select: UserModel.adminSelect,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      UserRepository.client.user.count({ where })
    ]);
    return { items, total };
  }

  static async findById(id: string): Promise<Backend.UserAdminRecord | null> {
    return UserRepository.client.user.findUnique({ where: { id }, select: UserModel.adminSelect });
  }

  static async findByEmail(email: string): Promise<Backend.UserAdminRecord | null> {
    return UserRepository.client.user.findUnique({ where: { email }, select: UserModel.adminSelect });
  }

  static async findByStudentCode(studentCode: string): Promise<Backend.UserAdminRecord | null> {
    return UserRepository.client.user.findUnique({ where: { studentCode }, select: UserModel.adminSelect });
  }

  static async create(input: Backend.UserCreateInput): Promise<Backend.UserAdminRecord> {
    return UserRepository.client.user.create({
      data: { email: input.email, username: input.username, role: input.role, studentCode: input.studentCode, status: 'PENDING' },
      select: UserModel.adminSelect
    });
  }

  static async update(id: string, input: Backend.UserUpdateInput): Promise<Backend.UserAdminRecord> {
    return UserRepository.client.user.update({ where: { id }, data: input, select: UserModel.adminSelect });
  }

  static async countActiveClassesOwnedBy(userId: string): Promise<number> {
    return UserRepository.client.class.count({ where: { ownerId: userId, status: 'ACTIVE' } });
  }

  static async updateStatus(id: string, status: Backend.UserStatus): Promise<Backend.UserAdminRecord> {
    return UserRepository.client.user.update({ where: { id }, data: { status }, select: UserModel.adminSelect });
  }
}
