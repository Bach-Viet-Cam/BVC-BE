export default class SystemConfigPolicyService {
  static readonly percentKeys = new Set([
    'min_accuracy_default',
    'at_risk_margin',
    'threshold_excellent',
    'threshold_good',
    'threshold_pass',
    'ensemble_min_data_percent'
  ]);
  static readonly integerKeys = new Set(['practice_min_per_week', 'default_max_submissions', 'max_recording_sec']);
  static readonly invalid = (message: string): { isValid: boolean; message: string } => ({ isValid: false, message });

  static validate(input: { key: string; valueType: Backend.ConfigValueType; nextValue: string; current: Record<string, string> }): { isValid: boolean; message?: string } {
    const typeResult = SystemConfigPolicyService.validateType(input.key, input.valueType, input.nextValue);
    if (!typeResult.isValid) return typeResult;
    if (input.valueType !== 'NUMBER') return { isValid: true };
    return SystemConfigPolicyService.validateRelations({ ...input.current, [input.key]: input.nextValue });
  }

  static validateType(key: string, valueType: Backend.ConfigValueType, nextValue: string): { isValid: boolean; message?: string } {
    if (valueType === 'NUMBER') return SystemConfigPolicyService.validateNumber(key, nextValue);
    if (valueType === 'BOOLEAN') {
      return nextValue === 'true' || nextValue === 'false' ? { isValid: true } : SystemConfigPolicyService.invalid('Giá trị phải là true hoặc false.');
    }
    if (valueType === 'JSON') return SystemConfigPolicyService.validateStringArray(nextValue);
    return nextValue.trim() ? { isValid: true } : SystemConfigPolicyService.invalid('Giá trị không được để trống.');
  }

  static validateNumber(key: string, nextValue: string): { isValid: boolean; message?: string } {
    const parsed = Number(nextValue);
    if (nextValue.trim() === '' || !Number.isFinite(parsed)) return SystemConfigPolicyService.invalid('Giá trị phải là một số.');
    if (SystemConfigPolicyService.percentKeys.has(key) && (parsed < 0 || parsed > 100)) {
      return SystemConfigPolicyService.invalid('Giá trị phải nằm trong khoảng 0 đến 100.');
    }
    if (SystemConfigPolicyService.integerKeys.has(key) && !Number.isInteger(parsed)) {
      return SystemConfigPolicyService.invalid('Giá trị phải là số nguyên.');
    }
    if (!SystemConfigPolicyService.percentKeys.has(key) && parsed <= 0) {
      return SystemConfigPolicyService.invalid('Giá trị phải lớn hơn 0.');
    }
    return { isValid: true };
  }

  static validateStringArray(nextValue: string): { isValid: boolean; message?: string } {
    try {
      const parsed: unknown = JSON.parse(nextValue);
      const isValid = Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === 'string' && item.trim() !== '');
      return isValid ? { isValid: true } : SystemConfigPolicyService.invalid('Giá trị phải là danh sách chuỗi không rỗng, ví dụ ["mp3","wav"].');
    } catch {
      return SystemConfigPolicyService.invalid('Giá trị phải là JSON hợp lệ.');
    }
  }

  static validateRelations(values: Record<string, string>): { isValid: boolean; message?: string } {
    const minAccuracy = Number(values.min_accuracy_default);
    const atRiskMargin = Number(values.at_risk_margin);
    if (Number.isFinite(minAccuracy) && Number.isFinite(atRiskMargin) && atRiskMargin >= minAccuracy) {
      return SystemConfigPolicyService.invalid('Biên "Có nguy cơ" phải nhỏ hơn accuracy tối thiểu.');
    }
    const excellent = Number(values.threshold_excellent);
    const good = Number(values.threshold_good);
    const pass = Number(values.threshold_pass);
    if ([excellent, good, pass].every(Number.isFinite) && !(excellent > good && good > pass)) {
      return SystemConfigPolicyService.invalid('Ngưỡng phải giảm dần: Xuất Sắc > Tốt > Đạt.');
    }
    return { isValid: true };
  }
}
