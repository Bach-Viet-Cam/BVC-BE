import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import RoadmapConstant from '../constant/RoadmapConstant.ts';
import RoadmapValidator from './RoadmapValidator.ts';

const messages = RoadmapConstant.messages;

function createValidWeeks(): Backend.RoadmapWeekInput[] {
  return Array.from({ length: 6 }, (_, index) => ({
    weekNumber: index + 1,
    title: `Tuần ${index + 1}`,
    content: `Nội dung tuần ${index + 1}`,
    exerciseIds: []
  }));
}

function createMockPiece(overrides: Partial<Backend.PieceSnapshot> = {}): Backend.PieceSnapshot {
  return {
    id: 'piece-1',
    title: 'Bài luyện ngón 1',
    kind: 'FINGER_EXERCISE',
    instrumentIds: ['inst-tranh'],
    isAvailable: true,
    ...overrides
  };
}

describe('RoadmapValidator (Validation kiểm tra dữ liệu lộ trình 6 tuần)', () => {
  describe('hasAllWeeks', () => {
    it('trả về true khi có đủ 6 tuần từ 1 đến 6', () => {
      assert.equal(RoadmapValidator.hasAllWeeks(createValidWeeks()), true);
    });

    describe('Giá trị biên (Boundary cases)', () => {
      it('thiếu tuần (5 tuần): trả về false', () => {
        const weeks = createValidWeeks().slice(0, 5);
        assert.equal(RoadmapValidator.hasAllWeeks(weeks), false);
      });

      it('thừa tuần (7 tuần): trả về false', () => {
        const weeks = [...createValidWeeks(), { weekNumber: 7, title: 'T7', content: 'C7', exerciseIds: [] }];
        assert.equal(RoadmapValidator.hasAllWeeks(weeks), false);
      });

      it('trùng số tuần (ví dụ có 2 tuần 2): trả về false', () => {
        const weeks = createValidWeeks();
        weeks[2].weekNumber = 2; // [1, 2, 2, 4, 5, 6]
        assert.equal(RoadmapValidator.hasAllWeeks(weeks), false);
      });

      it('số tuần ngoài khoảng 1..6 (ví dụ tuần 0): trả về false', () => {
        const weeks = createValidWeeks();
        weeks[0].weekNumber = 0; // [0, 2, 3, 4, 5, 6]
        assert.equal(RoadmapValidator.hasAllWeeks(weeks), false);
      });
    });
  });

  describe('validateText', () => {
    it('hợp lệ khi tiêu đề và nội dung đầy đủ', () => {
      const week: Backend.RoadmapWeekInput = {
        weekNumber: 1,
        title: 'Tuần 1',
        content: 'Nội dung tuần 1',
        exerciseIds: []
      };
      assert.deepEqual(RoadmapValidator.validateText(week), []);
    });

    it('báo lỗi MSG-35 khi tiêu đề để trống hoặc toàn khoảng trắng', () => {
      const week: Backend.RoadmapWeekInput = {
        weekNumber: 2,
        title: '   ',
        content: 'Nội dung',
        exerciseIds: []
      };
      const errors = RoadmapValidator.validateText(week);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].field, 'weeks.2.title');
      assert.equal(errors[0].code, 'MSG-35');
    });

    it('báo lỗi MSG-35 khi nội dung để trống hoặc toàn khoảng trắng', () => {
      const week: Backend.RoadmapWeekInput = {
        weekNumber: 3,
        title: 'Tuần 3',
        content: '   ',
        exerciseIds: []
      };
      const errors = RoadmapValidator.validateText(week);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].field, 'weeks.3.content');
      assert.equal(errors[0].code, 'MSG-35');
    });

    describe('Giá trị biên độ dài văn bản (Boundary cases)', () => {
      it('tiêu đề đúng 100 ký tự (hợp lệ) và 101 ký tự (lỗi MSG-37)', () => {
        const validTitleWeek: Backend.RoadmapWeekInput = {
          weekNumber: 1,
          title: 'a'.repeat(100),
          content: 'Nội dung',
          exerciseIds: []
        };
        assert.deepEqual(RoadmapValidator.validateText(validTitleWeek), []);

        const invalidTitleWeek: Backend.RoadmapWeekInput = {
          weekNumber: 1,
          title: 'a'.repeat(101),
          content: 'Nội dung',
          exerciseIds: []
        };
        const errors = RoadmapValidator.validateText(invalidTitleWeek);
        assert.equal(errors.length, 1);
        assert.equal(errors[0].field, 'weeks.1.title');
        assert.equal(errors[0].code, 'MSG-37');
      });

      it('nội dung đúng 1000 ký tự (hợp lệ) và 1001 ký tự (lỗi MSG-37)', () => {
        const validContentWeek: Backend.RoadmapWeekInput = {
          weekNumber: 1,
          title: 'Tuần 1',
          content: 'a'.repeat(1000),
          exerciseIds: []
        };
        assert.deepEqual(RoadmapValidator.validateText(validContentWeek), []);

        const invalidContentWeek: Backend.RoadmapWeekInput = {
          weekNumber: 1,
          title: 'Tuần 1',
          content: 'a'.repeat(1001),
          exerciseIds: []
        };
        const errors = RoadmapValidator.validateText(invalidContentWeek);
        assert.equal(errors.length, 1);
        assert.equal(errors[0].field, 'weeks.1.content');
        assert.equal(errors[0].code, 'MSG-37');
      });
    });
  });

  describe('validateExercises & isSelectable', () => {
    const validPiece = createMockPiece({ id: 'p-1', instrumentIds: ['inst-tranh'], isAvailable: true });
    const piecesMap = new Map([['p-1', validPiece]]);

    it('hợp lệ khi bài luyện ngón đúng môn học và đang hoạt động', () => {
      const week: Backend.RoadmapWeekInput = {
        weekNumber: 1,
        title: 'Tuần 1',
        content: 'Nội dung',
        exerciseIds: ['p-1']
      };
      assert.deepEqual(RoadmapValidator.validateExercises(week, piecesMap, 'inst-tranh'), []);
    });

    it('báo lỗi khi bài luyện ngón bị chọn trùng trong cùng một tuần', () => {
      const week: Backend.RoadmapWeekInput = {
        weekNumber: 1,
        title: 'Tuần 1',
        content: 'Nội dung',
        exerciseIds: ['p-1', 'p-1']
      };
      const errors = RoadmapValidator.validateExercises(week, piecesMap, 'inst-tranh');
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, messages.DUPLICATE_EXERCISE);
    });

    it('báo lỗi MSG-48 khi bài luyện ngón không khả dụng (thuộc nhạc cụ khác, bị ẩn hoặc không tìm thấy)', () => {
      const hiddenPiece = createMockPiece({ id: 'p-hidden', isAvailable: false });
      const wrongInstPiece = createMockPiece({ id: 'p-wrong', instrumentIds: ['inst-nhi'] });
      const map = new Map<string, Backend.PieceSnapshot>([
        ['p-hidden', hiddenPiece],
        ['p-wrong', wrongInstPiece]
      ]);

      const weekHidden: Backend.RoadmapWeekInput = {
        weekNumber: 1,
        title: 'T1',
        content: 'C1',
        exerciseIds: ['p-hidden']
      };
      const errors1 = RoadmapValidator.validateExercises(weekHidden, map, 'inst-tranh');
      assert.equal(errors1[0].code, 'MSG-48');

      const weekWrong: Backend.RoadmapWeekInput = {
        weekNumber: 1,
        title: 'T1',
        content: 'C1',
        exerciseIds: ['p-wrong']
      };
      const errors2 = RoadmapValidator.validateExercises(weekWrong, map, 'inst-tranh');
      assert.equal(errors2[0].code, 'MSG-48');
    });

    describe('Giá trị biên bài tập mỗi tuần (Boundary cases)', () => {
      it('đúng 50 bài luyện ngón trong một tuần (hợp lệ) và 51 bài (lỗi TOO_MANY_EXERCISES)', () => {
        const fiftyPieces = Array.from({ length: 50 }, (_, i) =>
          createMockPiece({ id: `p-${i}`, instrumentIds: ['inst-tranh'] })
        );
        const fiftyMap = new Map(fiftyPieces.map((p) => [p.id, p]));

        const validFiftyWeek: Backend.RoadmapWeekInput = {
          weekNumber: 1,
          title: 'T1',
          content: 'C1',
          exerciseIds: fiftyPieces.map((p) => p.id)
        };
        assert.deepEqual(RoadmapValidator.validateExercises(validFiftyWeek, fiftyMap, 'inst-tranh'), []);

        const fiftyOnePieces = [...fiftyPieces, createMockPiece({ id: 'p-50', instrumentIds: ['inst-tranh'] })];
        const fiftyOneMap = new Map(fiftyOnePieces.map((p) => [p.id, p]));
        const invalidFiftyOneWeek: Backend.RoadmapWeekInput = {
          weekNumber: 1,
          title: 'T1',
          content: 'C1',
          exerciseIds: fiftyOnePieces.map((p) => p.id)
        };
        const errors = RoadmapValidator.validateExercises(invalidFiftyOneWeek, fiftyOneMap, 'inst-tranh');
        assert.equal(errors.length, 1);
        assert.equal(errors[0].message, messages.TOO_MANY_EXERCISES);
      });
    });
  });

  describe('normalizeWeeks', () => {
    it('cắt tỉa khoảng trắng đầu cuối của title/content và sắp xếp các tuần theo thứ tự tăng dần', () => {
      const inputWeeks: Backend.RoadmapWeekInput[] = [
        { weekNumber: 3, title: '  Tuần 3  ', content: '  Nội dung 3  ', exerciseIds: [] },
        { weekNumber: 1, title: '\tTuần 1\n', content: 'Nội dung 1 ', exerciseIds: [] },
        { weekNumber: 2, title: 'Tuần 2', content: 'Nội dung 2', exerciseIds: [] }
      ];

      const normalized = RoadmapValidator.normalizeWeeks(inputWeeks);

      assert.equal(normalized[0].weekNumber, 1);
      assert.equal(normalized[0].title, 'Tuần 1');
      assert.equal(normalized[0].content, 'Nội dung 1');

      assert.equal(normalized[1].weekNumber, 2);

      assert.equal(normalized[2].weekNumber, 3);
      assert.equal(normalized[2].title, 'Tuần 3');
      assert.equal(normalized[2].content, 'Nội dung 3');
    });
  });
});
