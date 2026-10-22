import { describe, expect, it } from 'vitest';
import ChallengeRules from '../../src/modules/challenges/service/ChallengeRules.ts';

const valid = {
  title: 'Thử thách tuần',
  description: 'Mô tả',
  instrumentId: 'i1',
  pieceId: 'p1',
  classIds: ['c1'],
  weekStart: '2026-12-28',
  requiredBpm: 90,
  minAccuracy: 80,
  maxSubmissions: 3
};
const codes = (input: object): Array<string | undefined> => ChallengeRules.validatePublish({ ...valid, ...input }).map((issue) => issue.code);
const fields = (input: object): string[] => ChallengeRules.validatePublish({ ...valid, ...input }).map((issue) => issue.field);

describe('ChallengeRules.validatePublish', () => {
  it('accepts a complete input', () => {
    expect(ChallengeRules.validatePublish(valid)).toEqual([]);
  });

  it('requires instrument, piece, classes and week with MSG-35', () => {
    for (const field of ['instrumentId', 'pieceId', 'weekStart']) {
      expect(codes({ [field]: null })).toEqual(['MSG-35']);
      expect(fields({ [field]: null })).toEqual([field]);
    }
    expect(codes({ classIds: [] })).toEqual(['MSG-35']);
    expect(fields({ classIds: [] })).toEqual(['classIds']);
  });

  it('checks BPM range', () => {
    expect(codes({ requiredBpm: 29 })).toEqual(['MSG-03']);
    expect(codes({ requiredBpm: 241 })).toEqual(['MSG-03']);
    expect(codes({ requiredBpm: 30 })).toEqual([]);
    expect(codes({ requiredBpm: 240 })).toEqual([]);
  });

  it('checks accuracy and max submissions', () => {
    expect(codes({ minAccuracy: 101 })).toEqual(['MSG-03']);
    expect(codes({ minAccuracy: -1 })).toEqual(['MSG-03']);
    expect(codes({ maxSubmissions: 0 })).toEqual(['MSG-03']);
  });

  it('checks title and description length', () => {
    expect(codes({ title: 'a'.repeat(101) })).toEqual(['MSG-37']);
    expect(codes({ title: '' })).toEqual(['MSG-35']);
    expect(codes({ description: 'a'.repeat(2001) })).toEqual(['MSG-37']);
    expect(codes({ description: 'a'.repeat(2000) })).toEqual([]);
  });
});

describe('ChallengeRules.validateDraft', () => {
  it('passes with only a title', () => {
    expect(ChallengeRules.validateDraft({ title: 'Nháp' })).toEqual([]);
  });

  it('rejects a missing or too long title', () => {
    expect(ChallengeRules.validateDraft({ title: ' ' }).map((issue) => issue.code)).toEqual(['MSG-35']);
    expect(ChallengeRules.validateDraft({ title: 'a'.repeat(101) }).map((issue) => issue.code)).toEqual(['MSG-37']);
  });
});

describe('ChallengeRules.displayStatus', () => {
  const startsAt = new Date('2026-12-27T17:00:00.000Z');
  const endsAt = new Date('2027-01-03T16:59:59.999Z');

  it('derives the status from the clock', () => {
    expect(ChallengeRules.displayStatus({ status: 'DRAFT', startsAt: null, endsAt: null }, startsAt)).toBe('DRAFT');
    expect(ChallengeRules.displayStatus({ status: 'PUBLISHED', startsAt, endsAt }, new Date(startsAt.getTime() - 1))).toBe('UPCOMING');
    expect(ChallengeRules.displayStatus({ status: 'PUBLISHED', startsAt, endsAt }, new Date('2026-12-30T00:00:00.000Z'))).toBe('ACTIVE');
    expect(ChallengeRules.displayStatus({ status: 'PUBLISHED', startsAt, endsAt }, endsAt)).toBe('ACTIVE');
    expect(ChallengeRules.displayStatus({ status: 'PUBLISHED', startsAt, endsAt }, new Date(endsAt.getTime() + 1))).toBe('ENDED');
  });
});

describe('ChallengeRules.isPieceReady', () => {
  const piece = { visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null };
  const sheet = { visibility: 'PUBLIC', moderation: 'NORMAL', referenceAudioId: 'a1', analysisStatus: 'READY' };

  it('requires an available piece and a ready main sheet', () => {
    expect(ChallengeRules.isPieceReady(piece, sheet)).toBe(true);
    expect(ChallengeRules.isPieceReady(piece, { ...sheet, referenceAudioId: null })).toBe(false);
    expect(ChallengeRules.isPieceReady(piece, { ...sheet, analysisStatus: 'NONE' })).toBe(false);
    expect(ChallengeRules.isPieceReady(piece, { ...sheet, visibility: 'HIDDEN' })).toBe(false);
    expect(ChallengeRules.isPieceReady(piece, { ...sheet, moderation: 'ADMIN_HIDDEN' })).toBe(false);
    expect(ChallengeRules.isPieceReady({ ...piece, visibility: 'HIDDEN' }, sheet)).toBe(false);
    expect(ChallengeRules.isPieceReady({ ...piece, moderation: 'ADMIN_HIDDEN' }, sheet)).toBe(false);
    expect(ChallengeRules.isPieceReady(piece, null)).toBe(false);
  });
});

describe('ChallengeRules.overlaps', () => {
  it('detects shared ids', () => {
    expect(ChallengeRules.overlaps(['a', 'b'], ['b'])).toBe(true);
    expect(ChallengeRules.overlaps(['a'], ['b'])).toBe(false);
    expect(ChallengeRules.overlaps([], ['b'])).toBe(false);
  });
});
