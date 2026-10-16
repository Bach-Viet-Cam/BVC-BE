export default class ContentCategoryDTO {
  static toItem(record: Backend.ContentCategoryRecord): Backend.ContentCategoryItem {
    return { id: record.id, name: record.name, parentId: record.parentId };
  }
}
