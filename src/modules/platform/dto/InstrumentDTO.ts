export default class InstrumentDTO {
  static toItem(instrument: Backend.InstrumentRecord): { id: string; code: string; name: string; description: string | null; isActive: boolean } {
    return {
      id: instrument.id,
      code: instrument.code,
      name: instrument.name,
      description: instrument.description,
      isActive: instrument.isActive
    };
  }
}
