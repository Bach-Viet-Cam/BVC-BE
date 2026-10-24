export default class InstrumentDTO {
  static toTuneItem(tune: Backend.InstrumentTuneRecord): Backend.InstrumentTuneItem {
    return {
      id: tune.id,
      instrumentId: tune.instrumentId,
      tuneName: tune.tuneName,
      pitch: tune.pitch,
      displayOrder: tune.displayOrder
    };
  }

  static toItem(instrument: Backend.InstrumentRecord): {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
    tunesCount: number;
    tunes?: Backend.InstrumentTuneItem[];
  } {
    return {
      id: instrument.id,
      code: instrument.code,
      name: instrument.name,
      description: instrument.description,
      isActive: instrument.isActive,
      tunesCount: instrument.tunesCount ?? (instrument.tunes ? instrument.tunes.length : 0),
      ...(instrument.tunes ? { tunes: instrument.tunes.map(InstrumentDTO.toTuneItem) } : {})
    };
  }
}

