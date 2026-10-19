import PrismaClientProvider from '../../../config/PrismaClient.ts';

export default class ContentCategoryRepository {
  static readonly recordSelect = { id: true, name: true, parentId: true, sortOrder: true } as const;

  static get client() {
    return PrismaClientProvider.instance;
  }

  static async listRows(): Promise<Backend.ContentCategoryRow[]> {
    const rows = await ContentCategoryRepository.client.contentCategory.findMany({
      select: { ...ContentCategoryRepository.recordSelect, _count: { select: { pieces: { where: { deletedAt: null } } } } }
    });
    return rows.map(({ _count, ...row }) => ({ ...row, pieceCount: _count.pieces }));
  }

  static async findById(id: string): Promise<Backend.ContentCategoryRecord | null> {
    return ContentCategoryRepository.client.contentCategory.findUnique({ where: { id }, select: ContentCategoryRepository.recordSelect });
  }

  static async findSiblings(parentId: string | null): Promise<Backend.ContentCategoryRecord[]> {
    return ContentCategoryRepository.client.contentCategory.findMany({ where: { parentId }, select: ContentCategoryRepository.recordSelect });
  }

  static async countChildren(id: string): Promise<number> {
    return ContentCategoryRepository.client.contentCategory.count({ where: { parentId: id } });
  }

  static async countPieces(id: string): Promise<number> {
    return ContentCategoryRepository.client.piece.count({ where: { categoryId: id, deletedAt: null } });
  }

  static async create(data: { name: string; parentId: string | null; sortOrder: number }): Promise<Backend.ContentCategoryRecord> {
    return ContentCategoryRepository.client.contentCategory.create({ data, select: ContentCategoryRepository.recordSelect });
  }

  static async rename(id: string, name: string): Promise<Backend.ContentCategoryRecord> {
    return ContentCategoryRepository.client.contentCategory.update({ where: { id }, data: { name }, select: ContentCategoryRepository.recordSelect });
  }

  static async remove(id: string): Promise<void> {
    await ContentCategoryRepository.client.contentCategory.delete({ where: { id } });
  }
}
