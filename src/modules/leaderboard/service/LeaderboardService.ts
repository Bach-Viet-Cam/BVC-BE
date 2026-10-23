import AuthConstant from '../../auth/constant/AuthConstant.ts';
import LeaderboardConstant from '../constant/LeaderboardConstant.ts';
import LeaderboardDTO from '../dto/LeaderboardDTO.ts';
import LeaderboardRepository from '../repository/LeaderboardRepository.ts';
import LeaderboardSnapshotService from './LeaderboardSnapshotService.ts';

// Read side of UC-17: everything comes from the latest stored snapshot (NFR: no recomputation per request).
export default class LeaderboardService {
  static async getCurrent(viewer: Backend.UserDTO, query: Backend.LeaderboardQuery): Promise<Backend.LeaderboardCurrentDTO> {
    const semesterName = query.semester ?? (await LeaderboardSnapshotService.findCurrentSemester(new Date()))?.name ?? null;
    if (!semesterName) return LeaderboardDTO.toEmpty(null, query);
    const snapshot = await LeaderboardRepository.findLatest(semesterName);
    if (!snapshot) return LeaderboardDTO.toEmpty(semesterName, query);

    const category = LeaderboardConstant.categoryEnum[query.category];
    const topCount = LeaderboardConstant.paging.TOP_COUNT;
    const [totalRanked, categoryTotal, topRecords, pageRecords, me] = await Promise.all([
      LeaderboardRepository.countEntries(snapshot.id, 'OVERALL'),
      LeaderboardRepository.countEntries(snapshot.id, category),
      LeaderboardRepository.findPage(snapshot.id, category, 0, topCount),
      LeaderboardRepository.findPage(snapshot.id, category, topCount + (query.page - 1) * query.limit, query.limit),
      LeaderboardService.findMe(viewer, snapshot.id, query.category)
    ]);
    return {
      semester: { name: semesterName, label: LeaderboardDTO.toSemesterLabel(semesterName) },
      generatedAt: snapshot.generatedAt.toISOString(),
      totalRanked,
      categoryTotal,
      me,
      top3: topRecords.map((record) => LeaderboardDTO.toRow(record)),
      items: pageRecords.map((record) => LeaderboardDTO.toRow(record)),
      pagination: { page: query.page, limit: query.limit, total: Math.max(categoryTotal - topCount, 0) }
    };
  }

  // Only students see their own standing; the reason distinguishes "never ranked" from "no data on this tab"
  private static async findMe(viewer: Backend.UserDTO, snapshotId: string, categoryKey: Backend.LeaderboardCategoryKey): Promise<Backend.LeaderboardMeDTO | null> {
    if (viewer.role !== AuthConstant.roles.STUDENT) return null;
    const entry = await LeaderboardRepository.findEntry(snapshotId, LeaderboardConstant.categoryEnum[categoryKey], viewer.userId);
    if (entry) return { status: 'RANKED', rank: entry.rank, value: entry.value };
    const overall = await LeaderboardRepository.findEntry(snapshotId, 'OVERALL', viewer.userId);
    if (!overall) return { status: 'NO_ACTIVITY' };
    return { status: 'NOT_IN_CATEGORY', reason: categoryKey === 'improvement' ? 'NO_PREVIOUS_WEEK' : 'NO_DATA' };
  }

  static async refresh(): Promise<{ generatedAt: string | null }> {
    const result = await LeaderboardSnapshotService.build();
    return { generatedAt: result ? result.generatedAt.toISOString() : null };
  }
}
