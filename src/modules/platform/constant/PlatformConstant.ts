import MessageConstant from '../../../constants/MessageConstant.ts';

const format = MessageConstant.format;

export default class PlatformConstant {
  static readonly instrumentNameMaxLength = 100;

  // TODO(M06): grading thresholds stored in system_settings (admin-configurable, user decision 16/10).
  static readonly settingKeys = Object.freeze({ MIN_ACCURACY: 'grading.minAccuracy', AT_RISK_MARGIN: 'grading.atRiskMargin' });

  static readonly gradingLimits = Object.freeze({ MIN: 0, MAX: 100 });

  static readonly messages = Object.freeze({
    GRADING_SAVED: format('MSG-01', { action: 'Lưu', object: 'cấu hình chấm điểm' }),
    MARGIN_ABOVE_MINIMUM: 'Biên có nguy cơ không được lớn hơn độ chính xác tối thiểu.',
    GRADING_SETTINGS_MISSING: 'Thiếu cấu hình chấm điểm.',
    minAccuracyRange: format('MSG-03', { field: 'Độ chính xác tối thiểu', min: 0, max: 100 }),
    atRiskMarginRange: format('MSG-03', { field: 'Biên có nguy cơ', min: 0, max: 100 })
  });
}
