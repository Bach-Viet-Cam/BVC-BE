import type { PrismaClient } from '@prisma/client';
import ClassSeeder from './ClassSeeder.ts';

export default class CategorySeeder {
  static readonly tree: Record<string, string[]> = {
    'Dân ca': ['Dân ca Nam Bộ', 'Dân ca Bắc Bộ', 'Quan họ', 'Dân ca miền Trung'],
    'Nhạc lễ': ['Nhạc lễ Huế', 'Đờn ca tài tử'],
    'Nhạc cổ điển': ['Độc tấu', 'Hòa tấu nhỏ'],
    'Cộng đồng': ['Arrangement', 'Cover', 'Sáng tác mới']
  };

  static async ensure(client: PrismaClient, name: string, parentId: string | null, sortOrder: number): Promise<string> {
    const existing = await client.contentCategory.findFirst({ where: { name, parentId } });
    if (existing) return existing.id;
    return (await client.contentCategory.create({ data: { name, parentId, sortOrder } })).id;
  }

  async run(client: PrismaClient): Promise<void> {
    let southernFolkId = '';
    let parentOrder = 0;
    for (const [parentName, childNames] of Object.entries(CategorySeeder.tree)) {
      const parentId = await CategorySeeder.ensure(client, parentName, null, parentOrder);
      parentOrder += 1;
      for (const [childOrder, childName] of childNames.entries()) {
        const childId = await CategorySeeder.ensure(client, childName, parentId, childOrder);
        if (childName === 'Dân ca Nam Bộ') southernFolkId = childId;
      }
    }
    await client.piece.updateMany({ where: { id: ClassSeeder.pieceId, categoryId: null }, data: { categoryId: southernFolkId } });
  }
}
