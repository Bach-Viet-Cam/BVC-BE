import type { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import SettingsRepository from '../repository/SettingsRepository.ts';

const keys = PlatformConstant.settingKeys;
const messages = PlatformConstant.gradingMessages;

// Thresholds behind "Đạt" and the progress statuses. Values come only from system_configs:
// there is deliberately no hardcoded fallback (user decision 16/10).
export default class GradingSettingsService {
  static async getGradingSettings(client?: Prisma.TransactionClient): Promise<Backend.GradingSettings> {
    const rows = await SettingsRepository.findSettings([keys.MIN_ACCURACY, keys.AT_RISK_MARGIN], client);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const minAccuracy = byKey.get(keys.MIN_ACCURACY);
    const atRiskMargin = byKey.get(keys.AT_RISK_MARGIN);
    if (!minAccuracy || !atRiskMargin) throw new AppError(messages.GRADING_SETTINGS_MISSING, 500);

    const latest = minAccuracy.updatedAt > atRiskMargin.updatedAt ? minAccuracy.updatedAt : atRiskMargin.updatedAt;
    return { minAccuracy: Number(minAccuracy.value), atRiskMargin: Number(atRiskMargin.value), updatedAt: latest.toISOString() };
  }
}
