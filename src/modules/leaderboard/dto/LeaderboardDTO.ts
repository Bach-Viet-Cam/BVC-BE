import LeaderboardConstant from '../constant/LeaderboardConstant.ts';

export default class LeaderboardDTO {
  // FA26 -> "Học kỳ Thu 2026"; an unknown name is shown as it is (D1)
  static toSemesterLabel(name: string): string {
    const match = /^(FA|SP|SU)(\d{2})$/.exec(name);
    if (!match) return name;
    return `Học kỳ ${LeaderboardConstant.seasonLabels[match[1] as keyof typeof LeaderboardConstant.seasonLabels]} 20${match[2]}`;
  }

  static toRow(record: Backend.LeaderboardEntryRecord): Backend.LeaderboardRowDTO {
    return { rank: record.rank, studentId: record.studentId, fullName: record.fullName, className: record.className, value: record.value };
  }

  static toEmpty(semesterName: string | null, query: Backend.LeaderboardQuery): Backend.LeaderboardCurrentDTO {
    return {
      semester: semesterName ? { name: semesterName, label: LeaderboardDTO.toSemesterLabel(semesterName) } : null,
      generatedAt: null,
      totalRanked: 0,
      categoryTotal: 0,
      me: null,
      top3: [],
      items: [],
      pagination: { page: query.page, limit: query.limit, total: 0 }
    };
  }
}
