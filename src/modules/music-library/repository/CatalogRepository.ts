import type { CategoryType } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import MusicLibraryModel from '../model/MusicLibraryModel.ts';

// Read-only access to catalog data owned by M06 (categories, instruments, system config)
export default class CatalogRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findCategoriesByIds(type: CategoryType, categoryIds: string[]): Promise<MusicLibrary.CategoryRecord[]> {
    return CatalogRepository.client.category.findMany({
      where: { type, id: { in: categoryIds } },
      select: MusicLibraryModel.categoryRefSelect
    });
  }

  static async findInstrumentsByIds(instrumentIds: string[]): Promise<MusicLibrary.InstrumentRecord[]> {
    return CatalogRepository.client.instrument.findMany({
      where: { id: { in: instrumentIds } },
      select: MusicLibraryModel.instrumentRefSelect
    });
  }

  static async listActiveCategories(type: CategoryType): Promise<MusicLibrary.CategoryRecord[]> {
    return CatalogRepository.client.category.findMany({
      where: { type, status: 'ACTIVE' },
      select: MusicLibraryModel.categoryRefSelect,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }]
    });
  }

  static async listActiveInstruments(): Promise<MusicLibrary.InstrumentRecord[]> {
    return CatalogRepository.client.instrument.findMany({
      where: { status: 'ACTIVE' },
      select: MusicLibraryModel.instrumentRefSelect,
      orderBy: { name: 'asc' }
    });
  }

  static async findConfigValues(configKeys: string[]): Promise<{ key: string; value: string }[]> {
    return CatalogRepository.client.systemConfig.findMany({
      where: { key: { in: configKeys } },
      select: { key: true, value: true }
    });
  }
}
