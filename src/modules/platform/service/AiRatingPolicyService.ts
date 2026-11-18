import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import PracticeResultDTO from '../../practice/dto/PracticeResultDTO.ts';
import PracticeConstant from '../../practice/constant/PracticeConstant.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import AiRatingModel from '../model/AiRatingModel.ts';

export default class AiRatingPolicyService {
  static assertAccess(actor: Backend.UserDTO, row: Prisma.SubmissionGetPayload<{ include: typeof AiRatingModel.sourceInclude }>): void {
    if (actor.role === 1 && row.studentId === actor.userId) return;
    if (actor.role === 2 && row.assignment && !row.assignment.deletedAt && ClassAccessService.isClassLecturer(row.assignment.class, actor.userId)) return;
    throw AppError.notFound('Không tìm thấy bài nộp.');
  }
  static feedback(row: { status: string; aiFeedback: string | null; result: unknown; attempt: number; evaluationId: string | null; analyzedAt: Date | null }): { text: string; key: string } | null {
    if (row.status !== 'COMPLETED') return null;
    const text = (row.aiFeedback ?? new PracticeResultDTO().parseAnalysis(row.result).aiFeedback).trim();
    if (!text || text === PracticeConstant.fallbackFeedback) return null;
    return { text, key: createHash('sha256').update(JSON.stringify([row.evaluationId, row.attempt, row.analyzedAt, text])).digest('hex') };
  }
  static assertComment(role: number, comment: string | null | undefined): void {
    if (role === 1 && comment != null) throw AppError.badRequest('Sinh viên chỉ được chấm sao, không gửi nhận xét.');
  }
}
