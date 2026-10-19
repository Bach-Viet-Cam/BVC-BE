export type ProgressStatus = 'ON_TRACK' | 'AT_RISK' | 'BEHIND';

export default class ProgressPolicyService {
  static getStatus(input: { averageAccuracy: number | null; minAccuracy: number; atRiskMargin: number }): ProgressStatus | null {
    if (input.averageAccuracy === null) return null;
    if (input.averageAccuracy >= input.minAccuracy) return 'ON_TRACK';
    if (input.averageAccuracy >= input.minAccuracy - input.atRiskMargin) return 'AT_RISK';
    return 'BEHIND';
  }

  static average(values: number[]): number | null {
    if (values.length === 0) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round((total / values.length) * 10) / 10;
  }
}
