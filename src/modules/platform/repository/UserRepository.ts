import type { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
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

  static async findByEmailsOrCodes(emails: string[], codes: string[]): Promise<Backend.UserAdminRecord[]> {
    return UserRepository.client.user.findMany({
      where: { OR: [{ email: { in: emails } }, { studentCode: { in: codes } }] },
      select: UserModel.adminSelect
    });
  }

  static async applyStudentImport(creates: Backend.UserImportCreateData[], updates: Backend.UserImportUpdateData[]): Promise<void> {
    await UserRepository.client.$transaction(
      async (transaction) => {
        if (creates.length > 0) {
          await transaction.user.createMany({
            data: creates.map((item) => ({ ...item, role: AuthConstant.roles.STUDENT, status: 'PENDING' as const }))
          });
        }
        for (const item of updates) {
          const result = await transaction.user.updateMany({
            where: { id: item.id, role: AuthConstant.roles.STUDENT },
            data: { username: item.username, studentCode: item.studentCode }
          });
          // Tài khoản vừa bị xóa/đổi vai trò giữa lúc phân tích và lúc ghi → hủy cả transaction.
          if (result.count !== 1) throw AppError.conflict(PlatformConstant.messages.IMPORT_CONFLICT);
        }
      },
      { maxWait: 5000, timeout: PlatformConstant.userImport.transactionTimeoutMs }
    );
  }

  static isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
  }
}
