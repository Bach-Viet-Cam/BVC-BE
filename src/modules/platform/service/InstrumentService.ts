import AppError from '../../../utils/AppError.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import InstrumentDTO from '../dto/InstrumentDTO.ts';
import InstrumentRepository from '../repository/InstrumentRepository.ts';

type InstrumentItem = ReturnType<typeof InstrumentDTO.toItem>;

export default class InstrumentService {
  static async list(query: Backend.InstrumentListQuery): Promise<InstrumentItem[]> {
    return (await InstrumentRepository.list(query)).map(InstrumentDTO.toItem);
  }

  static async getOrThrow(id: string): Promise<Backend.InstrumentRecord> {
    const instrument = await InstrumentRepository.findById(id);
    if (!instrument) throw AppError.notFound(PlatformConstant.messages.INSTRUMENT_NOT_FOUND);
    return instrument;
  }

  static async create(input: Backend.InstrumentInput): Promise<InstrumentItem> {
    if (await InstrumentRepository.findByCode(input.code)) {
      throw AppError.conflict(PlatformConstant.messages.INSTRUMENT_CODE_EXISTS);
    }
    return InstrumentDTO.toItem(await InstrumentRepository.create(input));
  }

  static async update(id: string, input: Backend.InstrumentUpdateInput): Promise<InstrumentItem> {
    await InstrumentService.getOrThrow(id);
    return InstrumentDTO.toItem(await InstrumentRepository.update(id, input));
  }

  static async setActive(id: string, isActive: boolean): Promise<InstrumentItem> {
    await InstrumentService.getOrThrow(id);
    return InstrumentDTO.toItem(await InstrumentRepository.updateActive(id, isActive));
  }
}
