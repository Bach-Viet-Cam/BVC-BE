import { z } from 'zod';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';

export default class UserImportPolicyService {
  static readonly emailSchema = z.email().max(PlatformConstant.userImport.maxEmailLength);

  static normalizeRow(row: Backend.UserImportRowInput): Backend.UserImportRowInput {
    return {
      rowNumber: row.rowNumber,
      studentCode: row.studentCode.trim(),
      username: row.username.trim().replace(/\s+/g, ' '),
      email: row.email.trim().toLowerCase()
    };
  }

  static lookupKeys(rows: Backend.UserImportRowInput[]): { emails: string[]; codes: string[] } {
    const normalized = rows.map(UserImportPolicyService.normalizeRow);
    return {
      emails: [...new Set(normalized.map((row) => row.email).filter((email) => email !== ''))],
      codes: [...new Set(normalized.map((row) => row.studentCode).filter((code) => code !== ''))]
    };
  }

  static hasControlCharacter(value: string): boolean {
    return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  }

  static validateFields(row: Backend.UserImportRowInput): string[] {
    const messages = PlatformConstant.userImportMessages;
    const errors: string[] = [];
    if (row.email === '') errors.push(messages.EMAIL_REQUIRED);
    else if (!UserImportPolicyService.emailSchema.safeParse(row.email).success) errors.push(messages.EMAIL_INVALID);
    if (row.username === '') errors.push(messages.USERNAME_REQUIRED);
    else if (row.username.length > PlatformConstant.userImport.maxUsernameLength) errors.push(messages.USERNAME_TOO_LONG);
    else if (UserImportPolicyService.hasControlCharacter(row.username)) errors.push(messages.USERNAME_INVALID);
    if (row.studentCode === '') errors.push(messages.CODE_REQUIRED);
    else if (!PlatformConstant.userImport.studentCodePattern.test(row.studentCode)) errors.push(messages.CODE_INVALID);
    return errors;
  }

  static buildResult(
    row: Backend.UserImportRowInput,
    action: Backend.ImportAction,
    messages: string[],
    existingUserId: string | null
  ): Backend.UserImportRowResult {
    return { ...row, action, messages, existingUserId };
  }

  static analyze(input: { rows: Backend.UserImportRowInput[]; mode: Backend.ImportMode; existing: Backend.UserAdminRecord[] }): Backend.UserImportRowResult[] {
    const byEmail = new Map(input.existing.map((user) => [user.email, user]));
    const byCode = new Map(input.existing.filter((user) => user.studentCode !== null).map((user) => [user.studentCode as string, user]));
    const firstEmailRow = new Map<string, number>();
    const firstCodeRow = new Map<string, number>();

    return input.rows.map((rawRow) => {
      const row = UserImportPolicyService.normalizeRow(rawRow);
      const errors = UserImportPolicyService.validateFields(row);
      const emailFirstRow = row.email === '' ? undefined : firstEmailRow.get(row.email);
      const codeFirstRow = row.studentCode === '' ? undefined : firstCodeRow.get(row.studentCode);
      if (row.email !== '' && emailFirstRow === undefined) firstEmailRow.set(row.email, row.rowNumber);
      if (row.studentCode !== '' && codeFirstRow === undefined) firstCodeRow.set(row.studentCode, row.rowNumber);
      if (emailFirstRow !== undefined) errors.push(PlatformConstant.userImportMessages.duplicateEmail(emailFirstRow));
      if (codeFirstRow !== undefined) errors.push(PlatformConstant.userImportMessages.duplicateCode(codeFirstRow));
      if (errors.length > 0) return UserImportPolicyService.buildResult(row, 'ERROR', errors, null);
      return UserImportPolicyService.classify(row, input.mode, byEmail.get(row.email), byCode.get(row.studentCode));
    });
  }

  static classify(
    row: Backend.UserImportRowInput,
    mode: Backend.ImportMode,
    emailOwner: Backend.UserAdminRecord | undefined,
    codeOwner: Backend.UserAdminRecord | undefined
  ): Backend.UserImportRowResult {
    const messages = PlatformConstant.userImportMessages;
    if (!emailOwner) {
      if (codeOwner) return UserImportPolicyService.buildResult(row, 'ERROR', [messages.CODE_TAKEN], null);
      return UserImportPolicyService.buildResult(row, 'CREATE', [], null);
    }
    if (emailOwner.role !== AuthConstant.roles.STUDENT) {
      return UserImportPolicyService.buildResult(row, 'ERROR', [messages.EMAIL_PRIVILEGED], emailOwner.id);
    }
    if (codeOwner && codeOwner.id !== emailOwner.id) {
      return UserImportPolicyService.buildResult(row, 'ERROR', [messages.CODE_TAKEN], emailOwner.id);
    }
    if (mode === 'skip') return UserImportPolicyService.buildResult(row, 'SKIP', [messages.EXISTS_SKIPPED], emailOwner.id);
    const changes: string[] = [];
    if (emailOwner.username !== row.username) changes.push(messages.UPDATE_USERNAME);
    if (emailOwner.studentCode !== row.studentCode) changes.push(messages.UPDATE_CODE);
    if (changes.length === 0) return UserImportPolicyService.buildResult(row, 'SKIP', [messages.NO_CHANGES], emailOwner.id);
    return UserImportPolicyService.buildResult(row, 'UPDATE', changes, emailOwner.id);
  }

  static summarize(results: Backend.UserImportRowResult[]): Backend.UserImportSummary {
    const count = (action: Backend.ImportAction): number => results.filter((result) => result.action === action).length;
    return { total: results.length, create: count('CREATE'), update: count('UPDATE'), skip: count('SKIP'), error: count('ERROR') };
  }
}
