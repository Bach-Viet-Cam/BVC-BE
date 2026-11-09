import type { Faq } from '@prisma/client';

export default class FaqDTO {
  static item(row: Faq): Pick<Faq, 'id' | 'question' | 'answer' | 'topic' | 'instrumentId' | 'displayOrder' | 'isActive'> {
    return { id: row.id, question: row.question, answer: row.answer, topic: row.topic, instrumentId: row.instrumentId, displayOrder: row.displayOrder, isActive: row.isActive };
  }
}
