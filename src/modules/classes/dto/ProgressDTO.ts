import type { ProgressStatus } from '../service/ProgressPolicyService.ts';

export interface ProgressItem {
  userId: string;
  username: string;
  studentCode: string | null;
  submissionCount: number;
  averageAccuracy: number | null;
  status: ProgressStatus | null;
}

export interface ProgressResult {
  summary: { onTrack: number; atRisk: number; behind: number };
  items: ProgressItem[];
}

export default class ProgressDTO {
  static toResult(items: ProgressItem[], allItems: ProgressItem[]): ProgressResult {
    const countOf = (status: ProgressStatus): number => allItems.filter((item) => item.status === status).length;
    return { summary: { onTrack: countOf('ON_TRACK'), atRisk: countOf('AT_RISK'), behind: countOf('BEHIND') }, items };
  }
}
