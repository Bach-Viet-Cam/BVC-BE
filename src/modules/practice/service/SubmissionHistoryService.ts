import PracticeConstant from '../constant/PracticeConstant.ts';
import SubmissionHistoryDTO from '../dto/SubmissionHistoryDTO.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';

// SCR-01 submission history: the student's own submissions of every status, with quick and advanced filters
export default class SubmissionHistoryService {
  private readonly dto = new SubmissionHistoryDTO();

  constructor(private readonly repository: PracticeSubmissionRepository = new PracticeSubmissionRepository()) {}

  // Rows are not reconciled with the Rhythm service here (one call per row); the detail screen does that
  async list(studentId: string, query: Practice.HistoryQuery): Promise<Practice.HistoryDTO> {
    const [{ rows, total }, countByStatus] = await Promise.all([
      this.repository.findHistory(studentId, this.toFilter(query), { skip: (query.page - 1) * query.limit, take: query.limit }),
      this.repository.countByStatus(studentId)
    ]);
    return {
      items: rows.map((row) => this.dto.toItem(row)),
      pagination: { page: query.page, limit: query.limit, total },
      overall: this.dto.toOverall(countByStatus)
    };
  }

  async listPieceOptions(studentId: string): Promise<Practice.HistoryPieceOptionDTO[]> {
    return this.repository.findSubmittedPieces(studentId);
  }

  private toFilter(query: Practice.HistoryQuery): Practice.HistoryFilter {
    const { vietnamOffset } = PracticeConstant;
    const { fromDate, toDate } = query;
    return {
      pieceIds: query.pieceIds, accuracyRanges: query.accuracyRanges, kinds: query.kinds,
      minAccuracy: query.minAccuracy, maxAccuracy: query.maxAccuracy, title: query.title,
      from: fromDate ? new Date(`${fromDate}T00:00:00.000${vietnamOffset}`) : undefined,
      to: toDate ? new Date(`${toDate}T23:59:59.999${vietnamOffset}`) : undefined
    };
  }
}
