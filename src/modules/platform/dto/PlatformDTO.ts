export default class PlatformDTO {
  static toInstrumentDTO(instrument: Backend.InstrumentRecord): Backend.InstrumentDTO {
    return { id: instrument.id, name: instrument.name, isActive: instrument.isActive };
  }
}
