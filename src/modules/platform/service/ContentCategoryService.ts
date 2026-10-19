import AppError from '../../../utils/AppError.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import ContentCategoryDTO from '../dto/ContentCategoryDTO.ts';
import ContentCategoryRepository from '../repository/ContentCategoryRepository.ts';
import CategoryPolicyService from './CategoryPolicyService.ts';

export default class ContentCategoryService {
  static async list(): Promise<Backend.ContentCategoryNode[]> {
    return CategoryPolicyService.buildTree(await ContentCategoryRepository.listRows());
  }

  static async getOrThrow(id: string): Promise<Backend.ContentCategoryRecord> {
    const category = await ContentCategoryRepository.findById(id);
    if (!category) throw AppError.notFound(PlatformConstant.messages.CATEGORY_NOT_FOUND);
    return category;
  }

  static async create(input: Backend.ContentCategoryInput): Promise<Backend.ContentCategoryItem> {
    const name = CategoryPolicyService.normalizeName(input.name);
    const parentId = input.parentId ?? null;
    if (parentId) {
      const parent = await ContentCategoryService.getOrThrow(parentId);
      if (!CategoryPolicyService.canNest(parent)) throw AppError.badRequest(PlatformConstant.messages.CATEGORY_PARENT_INVALID);
    }
    const siblings = await ContentCategoryRepository.findSiblings(parentId);
    if (CategoryPolicyService.hasDuplicate(siblings, name)) throw AppError.conflict(PlatformConstant.messages.CATEGORY_NAME_EXISTS);
    const sortOrder = Math.max(-1, ...siblings.map((sibling) => sibling.sortOrder)) + 1;
    return ContentCategoryDTO.toItem(await ContentCategoryRepository.create({ name, parentId, sortOrder }));
  }

  static async rename(id: string, input: Backend.ContentCategoryUpdateInput): Promise<Backend.ContentCategoryItem> {
    const existing = await ContentCategoryService.getOrThrow(id);
    const name = CategoryPolicyService.normalizeName(input.name);
    const siblings = await ContentCategoryRepository.findSiblings(existing.parentId);
    if (CategoryPolicyService.hasDuplicate(siblings, name, id)) throw AppError.conflict(PlatformConstant.messages.CATEGORY_NAME_EXISTS);
    return ContentCategoryDTO.toItem(await ContentCategoryRepository.rename(id, name));
  }

  static async remove(id: string): Promise<{ id: string }> {
    await ContentCategoryService.getOrThrow(id);
    const [childCount, pieceCount] = await Promise.all([ContentCategoryRepository.countChildren(id), ContentCategoryRepository.countPieces(id)]);
    const decision = CategoryPolicyService.canDelete({ childCount, pieceCount });
    if (!decision.isAllowed) throw AppError.conflict(decision.message);
    await ContentCategoryRepository.remove(id);
    return { id };
  }
}
