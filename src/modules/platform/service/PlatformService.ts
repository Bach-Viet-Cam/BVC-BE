import PlatformDTO from '../dto/PlatformDTO.ts';
import PlatformRepository from '../repository/PlatformRepository.ts';

export default class PlatformService {
  static async listInstruments(isActiveOnly: boolean): Promise<Backend.InstrumentDTO[]> {
    const instruments = await PlatformRepository.findInstruments(isActiveOnly);
    return instruments.map(PlatformDTO.toInstrumentDTO);
  }
}
