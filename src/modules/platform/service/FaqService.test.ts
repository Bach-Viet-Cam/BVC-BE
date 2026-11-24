import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import FaqService from './FaqService.ts';
import FaqRepository from '../repository/FaqRepository.ts';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

// Chỉ dựng lớp lỗi để mô phỏng tình huống P2002/P2025, không mở kết nối DB.
const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError('dup', {
  code, clientVersion: '7.8.0'
});

const faqInput = {
  question: 'Cau hoi?', answer: 'Tra loi.', topic: 'PLATFORM',
  instrumentId: null, displayOrder: 0, isActive: true
};

const faqQuery = (status: 'ALL' | 'ACTIVE' | 'HIDDEN') => ({
  q: '', status, page: 1, pageSize: 20
});

test('UTC-FAQ-001 - non admin list forces isActive true', async (t) => {
  const listMock = t.mock.method(FaqRepository, 'list', async () => ({
    items: [], total: 0, page: 1, pageSize: 20
  }));

  await FaqService.list(faqQuery('ALL') as never, false);

  assert.equal(listMock.mock.calls[0].arguments[0].isActive, true);
});

test('UTC-FAQ-002 - admin HIDDEN list forces isActive false', async (t) => {
  const listMock = t.mock.method(FaqRepository, 'list', async () => ({
    items: [], total: 0, page: 1, pageSize: 20
  }));

  await FaqService.list(faqQuery('HIDDEN') as never, true);

  assert.equal(listMock.mock.calls[0].arguments[0].isActive, false);
});

test('UTC-FAQ-003 - save missing faq returns 404', async () => {
  // Prisma model delegates are Proxies, so t.mock.method cannot find a real
  // 'findUnique' descriptor. Shadow the delegate with a plain stub instead.
  const original = Object.getOwnPropertyDescriptor(PrismaClientProvider.instance, 'faq');
  Object.defineProperty(PrismaClientProvider.instance, 'faq', {
    configurable: true,
    value: { findUnique: async () => null }
  });

  try {
    await assert.rejects(
      () => FaqService.save('faq-1', 'actor-1', faqInput),
      { statusCode: 404, message: 'Câu hỏi không tồn tại.' }
    );
  } finally {
    if (original) Object.defineProperty(PrismaClientProvider.instance, 'faq', original);
    else Reflect.deleteProperty(PrismaClientProvider.instance, 'faq');
  }
});

test('UTC-FAQ-004 - repository P2002 maps to 409', async (t) => {
  t.mock.method(FaqRepository, 'save', async () => { throw knownError('P2002'); });

  await assert.rejects(
    () => FaqService.save(null, 'actor-1', faqInput),
    { statusCode: 409, message: 'Câu hỏi đã tồn tại trong chủ đề này.' }
  );
});

test('UTC-FAQ-005 - repository P2025 maps to 404', async (t) => {
  t.mock.method(FaqRepository, 'remove', async () => { throw knownError('P2025'); });

  await assert.rejects(
    () => FaqService.remove('faq-1', 'actor-1'),
    { statusCode: 404, message: 'Câu hỏi không tồn tại.' }
  );
});
