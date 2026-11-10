import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

// Admin access to the GENRE / LEVEL rows of `category`, the table pieces and sheet music point to
export default class CatalogCategoryRepository {
  static readonly recordSelect = {
    id: true,
    type: true,
    name: true,
    description: true,
    displayOrder: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { genrePieces: true, levelSheetMusic: true, legacyPieces: true } }
  } satisfies Prisma.CategorySelect;

  static get client() {
    return PrismaClientProvider.instance;
  }

  static buildListWhere(query: Backend.CatalogCategoryListQuery): Prisma.CategoryWhereInput {
    return {
      type: query.type,
      ...(query.status === 'all' ? {} : { status: query.status === 'active' ? 'ACTIVE' : 'INACTIVE' }),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {})
    };
  }

  static async list(query: Backend.CatalogCategoryListQuery): Promise<{ records: Backend.CatalogCategoryRecord[]; total: number }> {
    const where = CatalogCategoryRepository.buildListWhere(query);
    const [records, total] = await CatalogCategoryRepository.client.$transaction([
      CatalogCategoryRepository.client.category.findMany({
        where,
        select: CatalogCategoryRepository.recordSelect,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      CatalogCategoryRepository.client.category.count({ where })
    ]);
    return { records, total };
  }

  static async findById(id: string): Promise<Backend.CatalogCategoryRecord | null> {
    const record = await CatalogCategoryRepository.client.category.findUnique({
      where: { id },
      select: CatalogCategoryRepository.recordSelect
    });
    return record;
  }

  static async findByName(type: Backend.CatalogCategoryType, name: string, excludedId?: string): Promise<{ id: string } | null> {
    return CatalogCategoryRepository.client.category.findFirst({
      where: {
        type,
        name: { equals: name, mode: 'insensitive' },
        ...(excludedId ? { id: { not: excludedId } } : {})
      },
      select: { id: true }
    });
  }

  static async create(input: Backend.CatalogCategoryInput): Promise<Backend.CatalogCategoryRecord> {
    const record = await CatalogCategoryRepository.client.category.create({
      data: {
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        displayOrder: input.displayOrder ?? 0
      },
      select: CatalogCategoryRepository.recordSelect
    });
    return record;
  }

  static async update(id: string, input: Backend.CatalogCategoryUpdateInput): Promise<Backend.CatalogCategoryRecord> {
    const record = await CatalogCategoryRepository.client.category.update({
      where: { id },
      data: input,
      select: CatalogCategoryRepository.recordSelect
    });
    return record;
  }

  static async updateStatus(id: string, status: Backend.CatalogCategoryStatus): Promise<Backend.CatalogCategoryRecord> {
    const record = await CatalogCategoryRepository.client.category.update({
      where: { id },
      data: { status },
      select: CatalogCategoryRepository.recordSelect
    });
    return record;
  }

  static async delete(id: string): Promise<void> {
    await CatalogCategoryRepository.client.category.delete({ where: { id } });
  }
}
