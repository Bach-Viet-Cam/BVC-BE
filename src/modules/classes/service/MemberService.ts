import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassDTO from '../dto/ClassDTO.ts';
import MemberRepository from '../repository/MemberRepository.ts';
import ClassAccessService from './ClassAccessService.ts';
import StudentRowValidator from './StudentRowValidator.ts';

const messages = ClassConstant.messages;
const studentRole = AuthConstant.roles.STUDENT;

// UC-10 Manage Class Members (FR-M03.01.02 add/remove, FR-M03.01.04 list).
export default class MemberService {
  static async listMembers(classId: string, lecturerId: string, query: Backend.MemberListQuery): Promise<Backend.MemberListResult> {
    await ClassAccessService.assertOwnedClass(classId, lecturerId);
    const { members, total, totalMembers } = await MemberRepository.findMembers(classId, query);
    return {
      items: members.map(ClassDTO.toMemberDTO),
      pagination: { page: query.page, limit: query.limit, total },
      totalMembers
    };
  }

  // Step 1 of the manual add form: tells the lecturer whether the email already has an account
  // so the FE can prefill and lock the known fields before calling addMember.
  static async lookupMember(classId: string, lecturerId: string, email: string): Promise<Backend.MemberLookupDTO> {
    await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });
    const user = await MemberRepository.findUserByEmail(email);
    if (!user) return { status: 'NEW', fullName: null, studentCode: null };
    if (user.role !== studentRole) return { status: 'NOT_STUDENT', fullName: null, studentCode: null };

    const member = await MemberRepository.findActiveMembership(classId, user.id);
    return { status: member ? 'ALREADY_IN_CLASS' : 'STUDENT', fullName: user.username || null, studentCode: user.studentCode };
  }

  static async addMember(classId: string, lecturerId: string, input: Backend.StudentRowInput): Promise<Backend.MemberDTO> {
    const classRecord = await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });

    const member = await MemberService.runEnrollmentGuarded(() =>
      PrismaClientProvider.instance.$transaction(async (transaction) => {
        const { rows: [row], context } = await MemberService.validateAgainstDatabase(classId, [{ ...input, rowNumber: 1 }], transaction);
        if (!row.isValid) throw MemberService.rowError(row);
        const studentIds = await MemberService.enrollValidRows(classId, lecturerId, [row], context, { source: 'MANUAL', instrumentId: classRecord.instrumentId }, transaction);
        await AuditLogger.record({
          actorId: lecturerId,
          action: ClassConstant.auditActions.MEMBER_ADD,
          entityType: ClassConstant.auditEntityTypes.CLASS_MEMBER,
          entityId: classId,
          payload: { studentId: studentIds[0], email: row.email }
        }, transaction);
        return MemberRepository.findActiveMembership(classId, studentIds[0], transaction);
      })
    );
    if (!member) throw AppError.notFound(messages.MEMBER_NOT_FOUND);
    return ClassDTO.toMemberDTO(member);
  }

  static async removeMember(classId: string, lecturerId: string, studentId: string): Promise<void> {
    await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });
    const member = await MemberRepository.findActiveMembership(classId, studentId);
    if (!member) throw AppError.notFound(messages.MEMBER_NOT_FOUND);

    // GBR-39: soft removal keeps past submissions and evaluations.
    await PrismaClientProvider.instance.$transaction(async (transaction) => {
      await MemberRepository.softRemoveMember(member.id, lecturerId, transaction);
      await AuditLogger.record({
        actorId: lecturerId,
        action: ClassConstant.auditActions.MEMBER_REMOVE,
        entityType: ClassConstant.auditEntityTypes.CLASS_MEMBER,
        entityId: member.id,
        payload: { classId, studentId }
      }, transaction);
    });
  }

  static async buildValidationContext(
    classId: string,
    rows: Backend.RawStudentRow[],
    client: Prisma.TransactionClient
  ): Promise<Backend.StudentValidationContext> {
    const normalizedRows = rows.map(StudentRowValidator.normalizeRow);
    const emails = normalizedRows.map((row) => row.email).filter(Boolean);
    const studentCodes = normalizedRows.map((row) => row.studentCode).filter(Boolean);
    const [users, activeMemberIds] = await Promise.all([
      MemberRepository.findUsersByEmailsOrCodes(emails, studentCodes, client),
      MemberRepository.findActiveMemberIds(classId, client)
    ]);

    const usersByEmail = new Map<string, Backend.ExistingUserSnapshot>();
    const usersByStudentCode = new Map<string, Backend.ExistingUserSnapshot>();
    for (const user of users) {
      const snapshot = { ...user, email: user.email.toLowerCase(), studentCode: user.studentCode?.toUpperCase() ?? null };
      usersByEmail.set(snapshot.email, snapshot);
      if (snapshot.studentCode) usersByStudentCode.set(snapshot.studentCode, snapshot);
    }
    return { usersByEmail, usersByStudentCode, activeMemberIds, studentRole };
  }

  static async validateAgainstDatabase(
    classId: string,
    rows: Backend.RawStudentRow[],
    client: Prisma.TransactionClient
  ): Promise<{ rows: Backend.ValidatedStudentRow[]; context: Backend.StudentValidationContext }> {
    const context = await MemberService.buildValidationContext(classId, rows, client);
    return { rows: StudentRowValidator.validateRows(rows, context), context };
  }

  // Creates Pending student accounts for unknown emails (GBR-29), fills a missing student code
  // on existing students, then adds the memberships. Returns the enrolled student ids in row order.
  static async enrollValidRows(
    classId: string,
    actorId: string,
    rows: Backend.ValidatedStudentRow[],
    context: Backend.StudentValidationContext,
    options: { source: 'IMPORT' | 'MANUAL'; instrumentId: string; importLogId?: string },
    client: Prisma.TransactionClient
  ): Promise<string[]> {
    const studentIds: string[] = [];
    for (const row of rows.filter((validatedRow) => validatedRow.isValid)) {
      const existingUser = context.usersByEmail.get(row.email);
      if (!existingUser) {
        const createdUser = await MemberRepository.createPendingStudent(row, studentRole, client);
        studentIds.push(createdUser.id);
        continue;
      }
      if (!existingUser.studentCode) await MemberRepository.setStudentCode(existingUser.id, row.studentCode, client);
      studentIds.push(existingUser.id);
    }

    await MemberRepository.createMembers(
      studentIds.map((studentId) => ({ classId, studentId, instrumentId: options.instrumentId, source: options.source, addedById: actorId, importLogId: options.importLogId })),
      client
    );
    return studentIds;
  }

  static readonly conflictReasons: ReadonlySet<string> = new Set([
    ClassConstant.rowReasons.ALREADY_IN_CLASS,
    ClassConstant.rowReasons.CODE_BELONGS_TO_OTHER_EMAIL,
    ClassConstant.rowReasons.EMAIL_HAS_OTHER_CODE,
    ClassConstant.rowReasons.EMAIL_NOT_STUDENT
  ]);

  static rowError(row: Backend.ValidatedStudentRow): AppError {
    const statusCode = MemberService.conflictReasons.has(row.reason ?? '') ? 409 : 400;
    return AppError.fieldError(statusCode, { field: row.reasonField ?? 'email', message: `${row.reason}.` });
  }

  static async runEnrollmentGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (ClassAccessService.isUniqueViolation(error)) throw AppError.conflict(messages.IMPORT_DATA_CHANGED, { code: 'MSG-08' });
      throw error;
    }
  }
}
