import { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import CatalogCategoryDTO from '../dto/CatalogCategoryDTO.ts';
import CatalogCategoryRepository from '../repository/CatalogCategoryRepository.ts';

const MESSAGES = PlatformConstant.messages;

export default class CatalogCategoryService {
  static async list(query: Backend.CatalogCategoryListQuery): Promise<{ items: Backend.CatalogCategoryItem[]; pagination: Backend.PaginationMeta }> {
    const { records, total } = await CatalogCategoryRepository.list(query);
    return {
      items: records.map(CatalogCategoryDTO.toItem),
      pagination: { page: query.page, limit: query.limit, total }
    };
  }

  static async getOrThrow(id: string): Promise<Backend.CatalogCategoryRecord> {
    const record = await CatalogCategoryRepository.findById(id);
    if (!record) throw AppError.notFound(MESSAGES.CATEGORY_NOT_FOUND);
    return record;
  }

  static async assertUniqueName(type: Backend.CatalogCategoryType, name: string, excludedId?: string): Promise<void> {
    if (await CatalogCategoryRepository.findByName(type, name, excludedId)) {
      throw AppError.conflict(MESSAGES.CATALOG_CATEGORY_NAME_EXISTS, { field: 'name' });
    }
  }

  // Two requests creating the same name at once hit the (type, name) unique index
  static mapUniqueViolation(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw AppError.conflict(MESSAGES.CATALOG_CATEGORY_NAME_EXISTS, { field: 'name' });
    }
    throw error;
  }

  static async create(input: Backend.CatalogCategoryInput): Promise<Backend.CatalogCategoryItem> {
    await CatalogCategoryService.assertUniqueName(input.type, input.name);
    const record = await CatalogCategoryRepository.create(input).catch(CatalogCategoryService.mapUniqueViolation);
    return CatalogCategoryDTO.toItem(record);
  }

  static async update(id: string, input: Backend.CatalogCategoryUpdateInput): Promise<Backend.CatalogCategoryItem> {
    const current = await CatalogCategoryService.getOrThrow(id);
    if (input.name !== undefined) await CatalogCategoryService.assertUniqueName(current.type, input.name, id);
    const record = await CatalogCategoryRepository.update(id, input).catch(CatalogCategoryService.mapUniqueViolation);
    return CatalogCategoryDTO.toItem(record);
  }

  // GBR-44: an inactive category stays on the pieces and sheets that already use it but cannot be newly chosen
  static async setActive(id: string, isActive: boolean): Promise<Backend.CatalogCategoryItem> {
    await CatalogCategoryService.getOrThrow(id);
    return CatalogCategoryDTO.toItem(await CatalogCategoryRepository.updateStatus(id, isActive ? 'ACTIVE' : 'INACTIVE'));
  }

  static async remove(id: string): Promise<{ id: string }> {
    const record = await CatalogCategoryService.getOrThrow(id);
    if (CatalogCategoryDTO.countUsage(record) > 0) throw AppError.conflict(MESSAGES.CATALOG_CATEGORY_IN_USE);
    await CatalogCategoryRepository.delete(id);
    return { id };
  }
}
