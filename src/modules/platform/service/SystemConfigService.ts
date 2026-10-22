import AppError from '../../../utils/AppError.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import SystemConfigDTO from '../dto/SystemConfigDTO.ts';
import SystemConfigRepository from '../repository/SystemConfigRepository.ts';
import SystemConfigPolicyService from './SystemConfigPolicyService.ts';

export default class SystemConfigService {
  static async list(query: Backend.SystemConfigListQuery): Promise<Backend.SystemConfigRecord[]> {
    return (await SystemConfigRepository.list(query)).map(SystemConfigDTO.toItem);
  }

  static async updateValue(id: string, value: string, actorId: string): Promise<Backend.SystemConfigRecord> {
    const config = await SystemConfigRepository.findById(id);
    if (!config) throw AppError.notFound(PlatformConstant.messages.CONFIG_NOT_FOUND);
    const all = await SystemConfigRepository.listAll();
    const current = Object.fromEntries(all.map((item) => [item.key, item.value]));
    const result = SystemConfigPolicyService.validate({ key: config.key, valueType: config.valueType, nextValue: value, current });
    if (!result.isValid) throw AppError.badRequest(result.message);
    return SystemConfigDTO.toItem(await SystemConfigRepository.updateValue(id, value, actorId));
  }

  static async getNumber(key: string): Promise<number> {
    const config = await SystemConfigRepository.findByKey(key);
    if (!config) throw AppError.notFound(PlatformConstant.messages.CONFIG_NOT_FOUND);
    return Number(config.value);
  }

  static async getStringList(key: string): Promise<string[]> {
    const config = await SystemConfigRepository.findByKey(key);
    if (!config) throw AppError.notFound(PlatformConstant.messages.CONFIG_NOT_FOUND);
    const parsed: unknown = JSON.parse(config.value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  }

  // Missing or malformed config yields an empty list; the admin page rejects bad JSON on save.
  static async getSemesters(): Promise<Backend.Semester[]> {
    const config = await SystemConfigRepository.findByKey(PlatformConstant.settingKeys.SEMESTERS);
    if (!config || !SystemConfigPolicyService.validateSemesters(config.value).isValid) return [];
    const semesters = JSON.parse(config.value) as Backend.Semester[];
    return semesters
      .map((semester) => ({ name: semester.name.trim(), startDate: semester.startDate, endDate: semester.endDate }))
      .sort((left, right) => left.startDate.localeCompare(right.startDate));
  }
}
