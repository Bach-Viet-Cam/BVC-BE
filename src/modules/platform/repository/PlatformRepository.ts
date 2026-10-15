import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PlatformModel from '../model/PlatformModel.ts';

// TODO(M06): the instrument catalogue (create/update/deactivate) belongs to M06.
export default class PlatformRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findInstruments(isActiveOnly: boolean): Promise<Backend.InstrumentRecord[]> {
    return PlatformRepository.client.instrument.findMany({
      where: isActiveOnly ? { isActive: true } : {},
      select: PlatformModel.instrumentSelect,
      orderBy: { name: 'asc' }
    });
  }
}
