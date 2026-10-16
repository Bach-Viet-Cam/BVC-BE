import PlatformConstant from '../constant/PlatformConstant.ts';

export default class CategoryPolicyService {
  static normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  static hasDuplicate(siblings: Backend.ContentCategoryRecord[], name: string, ignoreId?: string): boolean {
    const target = CategoryPolicyService.normalizeName(name).toLocaleLowerCase('vi');
    return siblings.some((sibling) => sibling.id !== ignoreId && CategoryPolicyService.normalizeName(sibling.name).toLocaleLowerCase('vi') === target);
  }

  static canNest(parent: Backend.ContentCategoryRecord): boolean {
    return parent.parentId === null;
  }

  static canDelete(input: { childCount: number; pieceCount: number }): { isAllowed: boolean; message?: string } {
    if (input.childCount > 0) return { isAllowed: false, message: PlatformConstant.messages.CATEGORY_HAS_CHILDREN };
    if (input.pieceCount > 0) return { isAllowed: false, message: PlatformConstant.messages.CATEGORY_HAS_PIECES };
    return { isAllowed: true };
  }

  static compareRows(left: Backend.ContentCategoryRow, right: Backend.ContentCategoryRow): number {
    return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'vi');
  }

  static buildTree(rows: Backend.ContentCategoryRow[]): Backend.ContentCategoryNode[] {
    const sorted = [...rows].sort(CategoryPolicyService.compareRows);
    const topLevel = sorted.filter((row) => row.parentId === null);
    return topLevel.map((parent) => {
      const children = sorted
        .filter((row) => row.parentId === parent.id)
        .map((child) => ({ id: child.id, name: child.name, pieceCount: child.pieceCount }));
      const childPieces = children.reduce((sum, child) => sum + child.pieceCount, 0);
      return { id: parent.id, name: parent.name, pieceCount: parent.pieceCount + childPieces, children };
    });
  }
}
