import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import FaqSeeder from './FaqSeeder.ts';
import FaqValidation from '../../src/modules/platform/validation/FaqValidation.ts';

it('FAQ mặc định hợp lệ, chạy lại giữ nguyên nội dung đã chỉnh và trạng thái ẩn', async () => {
  const rows = new Map<string, { answer: string; isActive: boolean }>();
  const client = {
    user: { findFirst: async () => ({ id: 'admin' }) },
    faq: { upsert: async (input: { where: { topic_questionKey: { topic: string; questionKey: string } }; update: object; create: { question: string; answer: string; topic: string; displayOrder: number; isActive: boolean; instrumentId: null } }) => {
      assert.deepEqual(input.update, {});
      const { question, answer, topic, displayOrder, isActive, instrumentId } = input.create;
      FaqValidation.input.parse({ question, answer, topic, displayOrder, isActive, instrumentId });
      const key = JSON.stringify(input.where);
      if (!rows.has(key)) rows.set(key, { answer, isActive });
      return rows.get(key);
    } },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations)
  } as unknown as PrismaClient;
  await FaqSeeder.run(client);
  assert.equal(rows.size, 5);
  const first = rows.values().next().value!;
  first.answer = 'Nội dung quản trị đã cập nhật';
  first.isActive = false;
  await FaqSeeder.run(client);
  assert.equal(rows.size, 5);
  assert.equal(first.answer, 'Nội dung quản trị đã cập nhật');
  assert.equal(first.isActive, false);
});

it('không tạo FAQ khi chưa có quản trị hợp lệ', async () => {
  const client = { user: { findFirst: async () => null } } as unknown as PrismaClient;
  await assert.rejects(() => FaqSeeder.run(client), /quản trị/);
});
