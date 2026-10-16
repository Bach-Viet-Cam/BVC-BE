import { describe, expect, it } from 'vitest';
import RoadmapValidator from '../../src/modules/roadmaps/service/RoadmapValidator.ts';

const INSTRUMENT = 'i1';
const pieces = new Map<string, Backend.PieceSnapshot>([
  ['p1', { id: 'p1', title: 'Gẩy đơn', instrumentId: INSTRUMENT, kind: 'FINGER_EXERCISE', isVisible: true }],
  ['p2', { id: 'p2', title: 'Vê', instrumentId: INSTRUMENT, kind: 'FINGER_EXERCISE', isVisible: true }],
  ['song', { id: 'song', title: 'Lý ngựa ô', instrumentId: INSTRUMENT, kind: 'SONG', isVisible: true }],
  ['otherInstrument', { id: 'otherInstrument', title: 'Bầu', instrumentId: 'i2', kind: 'FINGER_EXERCISE', isVisible: true }],
  ['hidden', { id: 'hidden', title: 'Cũ', instrumentId: INSTRUMENT, kind: 'FINGER_EXERCISE', isVisible: false }]
]);

function validWeeks(): Backend.RoadmapWeekInput[] {
  return [1, 2, 3, 4, 5, 6].map((weekNumber) => ({ weekNumber, title: `Tuần ${weekNumber}`, content: 'Nội dung', exerciseIds: ['p1'] }));
}

describe('RoadmapValidator', () => {
  it('accepts six valid weeks', () => {
    expect(RoadmapValidator.validateWeeks(validWeeks(), pieces, INSTRUMENT)).toEqual([]);
  });

  it('requires exactly six distinct week numbers', () => {
    expect(RoadmapValidator.validateWeeks(validWeeks().slice(0, 5), pieces, INSTRUMENT)).toEqual([{ field: 'weeks', message: 'Lộ trình phải có đủ 6 tuần.' }]);
    const duplicated = validWeeks();
    duplicated[5].weekNumber = 5;
    expect(RoadmapValidator.validateWeeks(duplicated, pieces, INSTRUMENT)).toEqual([{ field: 'weeks', message: 'Lộ trình phải có đủ 6 tuần.' }]);
  });

  it('whitespace-only title and content are blank (MSG-35) and errors are collected for every week', () => {
    const weeks = validWeeks();
    weeks[0].title = '   ';
    weeks[2].content = '';
    expect(RoadmapValidator.validateWeeks(RoadmapValidator.normalizeWeeks(weeks), pieces, INSTRUMENT)).toEqual([
      { field: 'weeks.1.title', code: 'MSG-35', message: 'Tiêu đề tuần 1 không được để trống.' },
      { field: 'weeks.3.content', code: 'MSG-35', message: 'Nội dung học tập tuần 3 không được để trống.' }
    ]);
  });

  it('limits title to 100 and content to 1000 characters (MSG-37)', () => {
    const weeks = validWeeks();
    weeks[1].title = 'x'.repeat(101);
    weeks[1].content = 'y'.repeat(1001);
    expect(RoadmapValidator.validateWeeks(weeks, pieces, INSTRUMENT)).toEqual([
      { field: 'weeks.2.title', code: 'MSG-37', message: 'Tiêu đề tuần 2 không được vượt quá 100 ký tự.' },
      { field: 'weeks.2.content', code: 'MSG-37', message: 'Nội dung học tập tuần 2 không được vượt quá 1000 ký tự.' }
    ]);
    weeks[1].title = 'x'.repeat(100);
    weeks[1].content = 'y'.repeat(1000);
    expect(RoadmapValidator.validateWeeks(weeks, pieces, INSTRUMENT)).toEqual([]);
  });

  it('rejects duplicate exercises inside a week but allows them across weeks', () => {
    const weeks = validWeeks();
    weeks[0].exerciseIds = ['p1', 'p2', 'p1'];
    expect(RoadmapValidator.validateWeeks(weeks, pieces, INSTRUMENT)).toEqual([
      { field: 'weeks.1.exerciseIds', message: 'Bài luyện ngón bị chọn trùng trong tuần.' }
    ]);
  });

  it.each([['missing'], ['song'], ['otherInstrument'], ['hidden']])('rejects %s piece with MSG-48', (pieceId) => {
    const weeks = validWeeks();
    weeks[3].exerciseIds = ['p1', pieceId];
    expect(RoadmapValidator.validateWeeks(weeks, pieces, INSTRUMENT)).toEqual([
      { field: 'weeks.4.exerciseIds', code: 'MSG-48', message: 'Bài luyện ngón đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.' }
    ]);
  });

  it('caps a week at 50 exercises', () => {
    const weeks = validWeeks();
    weeks[0].exerciseIds = Array.from({ length: 51 }, (_, index) => `p${index}`);
    expect(RoadmapValidator.validateWeeks(weeks, pieces, INSTRUMENT)).toEqual([
      { field: 'weeks.1.exerciseIds', message: 'Mỗi tuần tối đa 50 bài luyện ngón.' }
    ]);
  });

  it('normalizes by trimming text and sorting by week number', () => {
    const weeks = validWeeks().reverse();
    weeks[0].title = '  Tuần sáu  ';
    const normalized = RoadmapValidator.normalizeWeeks(weeks);
    expect(normalized.map((week) => week.weekNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(normalized[5].title).toBe('Tuần sáu');
  });
});
