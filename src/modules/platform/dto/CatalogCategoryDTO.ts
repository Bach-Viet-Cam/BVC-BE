export default class CatalogCategoryDTO {
  static countUsage(record: Backend.CatalogCategoryRecord): number {
    const { genrePieces, levelSheetMusic, legacyPieces } = record._count;
    return genrePieces + levelSheetMusic + legacyPieces;
  }

  static toItem(record: Backend.CatalogCategoryRecord): Backend.CatalogCategoryItem {
    return {
      id: record.id,
      type: record.type,
      name: record.name,
      description: record.description,
      displayOrder: record.displayOrder,
      status: record.status,
      usageCount: CatalogCategoryDTO.countUsage(record),
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
