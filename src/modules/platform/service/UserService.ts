import AppError from '../../../utils/AppError.ts';
import AuthRepository from '../../auth/repository/AuthRepository.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import UserDTO from '../dto/UserDTO.ts';
import UserRepository from '../repository/UserRepository.ts';
import UserPolicyService from './UserPolicyService.ts';
import UserImportPolicyService from './UserImportPolicyService.ts';

export default class UserService {
  static async list(query: Backend.UserListQuery): Promise<Backend.PaginatedResult<Backend.UserListItem>> {
    const { items, total } = await UserRepository.list(query);
    return { items: items.map(UserDTO.toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  static async assertUnique(input: { email?: string; studentCode?: string | null }, ignoreUserId?: string): Promise<void> {
    if (input.email) {
      const existing = await UserRepository.findByEmail(input.email);
      if (existing && existing.id !== ignoreUserId) throw AppError.conflict(PlatformConstant.messages.EMAIL_EXISTS);
    }
    if (input.studentCode) {
      const existing = await UserRepository.findByStudentCode(input.studentCode);
      if (existing && existing.id !== ignoreUserId) throw AppError.conflict(PlatformConstant.messages.STUDENT_CODE_EXISTS);
    }
  }

  static async create(input: Backend.UserCreateInput): Promise<Backend.UserListItem> {
    await UserService.assertUnique(input);
    return UserDTO.toListItem(await UserRepository.create(input));
  }

  static async getOrThrow(id: string): Promise<Backend.UserAdminRecord> {
    const user = await UserRepository.findById(id);
    if (!user) throw AppError.notFound(PlatformConstant.messages.USER_NOT_FOUND);
    return user;
  }

  static async update(actorId: string, targetId: string, input: Backend.UserUpdateInput): Promise<Backend.UserListItem> {
    const target = await UserService.getOrThrow(targetId);
    const isEmailChanged = input.email !== undefined && input.email !== target.email;
    if (isEmailChanged && !UserPolicyService.canChangeEmail({ hasEverSignedIn: target.lastLoginAt !== null })) {
      throw AppError.badRequest(PlatformConstant.messages.EMAIL_LOCKED);
    }
    if (input.role !== undefined) {
      const roleCheck = UserPolicyService.canChangeRole({
        actorId,
        targetId,
        currentRole: target.role,
        nextRole: input.role,
        targetOwnsActiveClasses: input.role !== target.role && (await UserRepository.countActiveClassesOwnedBy(targetId)) > 0
      });
      if (!roleCheck.isAllowed) throw AppError.forbidden(roleCheck.message);
    }
    await UserService.assertUnique(input, targetId);
    return UserDTO.toListItem(await UserRepository.update(targetId, input));
  }

  static async lock(actorId: string, targetId: string): Promise<Backend.UserListItem> {
    if (!UserPolicyService.canLock({ actorId, targetId })) throw AppError.forbidden(PlatformConstant.messages.CANNOT_LOCK_SELF);
    await UserService.getOrThrow(targetId);
    const updated = await UserRepository.updateStatus(targetId, 'LOCKED');
    await AuthRepository.revokeSessionsByUser(targetId);
    return UserDTO.toListItem(updated);
  }

  static async unlock(targetId: string): Promise<Backend.UserListItem> {
    const target = await UserService.getOrThrow(targetId);
    const nextStatus: Backend.UserStatus = target.lastLoginAt ? 'ACTIVE' : 'PENDING';
    return UserDTO.toListItem(await UserRepository.updateStatus(targetId, nextStatus));
  }

  static async importStudents(input: Backend.UserImportInput): Promise<Backend.UserImportResult> {
    const keys = UserImportPolicyService.lookupKeys(input.rows);
    const existing = await UserRepository.findByEmailsOrCodes(keys.emails, keys.codes);
    const results = UserImportPolicyService.analyze({ rows: input.rows, mode: input.mode, existing });
    const summary = UserImportPolicyService.summarize(results);
    if (input.dryRun) return { dryRun: true, results, summary, createdCount: 0, updatedCount: 0 };
    if (summary.create + summary.update === 0) throw AppError.badRequest(PlatformConstant.messages.IMPORT_NO_ACTIONABLE_ROWS);

    const creates = results
      .filter((result) => result.action === 'CREATE')
      .map((result) => ({ email: result.email, username: result.username, studentCode: result.studentCode }));
    const updates = results
      .filter((result) => result.action === 'UPDATE' && result.existingUserId !== null)
      .map((result) => ({ id: result.existingUserId as string, username: result.username, studentCode: result.studentCode }));
    try {
      await UserRepository.applyStudentImport(creates, updates);
    } catch (error: unknown) {
      if (UserRepository.isUniqueViolation(error)) throw AppError.conflict(PlatformConstant.messages.IMPORT_CONFLICT);
      throw error;
    }
    return { dryRun: false, results, summary, createdCount: creates.length, updatedCount: updates.length };
  }
}
