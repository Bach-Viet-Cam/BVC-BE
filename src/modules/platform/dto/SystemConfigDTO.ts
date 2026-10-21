export default class SystemConfigDTO {
  static toItem(config: Backend.SystemConfigRecord): Backend.SystemConfigRecord {
    return {
      id: config.id,
      key: config.key,
      value: config.value,
      valueType: config.valueType,
      group: config.group,
      label: config.label,
      description: config.description
    };
  }
}
