import AppError from '../../../utils/AppError.ts';
import RhythmClientService from '../../audio/service/RhythmClientService.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeResultRepository from '../repository/PracticeResultRepository.ts';
import PitchChartBuilderService from './PitchChartBuilderService.ts';

// The chart is built once from the Rhythm analysis file and cached on the submission; any problem only
// hides the chart (MSG-26) while the rest of the results screen keeps working
export default class PitchChartService {
  constructor(
    private readonly repository: PracticeResultRepository = new PracticeResultRepository(),
    private readonly client: RhythmClientService = new RhythmClientService()
  ) {}

  async getChart(record: Practice.ResultRecord, issues: Practice.ResultIssueDTO[]): Promise<Practice.PitchChartDTO> {
    if (this.isCachedChart(record.pitchChart)) return record.pitchChart;
    if (!record.evaluationId) throw this.unavailable();
    let chart: Practice.PitchChartDTO;
    try {
      const raw = await this.client.getAnalysis(record.evaluationId);
      if (raw === null) throw new Error('Rhythm không có file phân tích cho bản thu này.');
      chart = PitchChartBuilderService.build(PitchChartBuilderService.parse(raw), issues);
    } catch (error) {
      console.error(`Không thể dựng biểu đồ cao độ cho bản nộp ${record.id}:`, error instanceof Error ? error.message : error);
      throw this.unavailable();
    }
    // A failed cache write only means the next view rebuilds the chart
    await this.repository.savePitchChart(record.id, chart)
      .catch(() => console.error(`Không thể lưu biểu đồ cao độ cho bản nộp ${record.id}.`));
    return chart;
  }

  private isCachedChart(cached: unknown): cached is Practice.PitchChartDTO {
    return typeof cached === 'object' && cached !== null && Array.isArray((cached as { points?: unknown }).points);
  }

  private unavailable(): AppError {
    return new AppError(PracticeConstant.messages.PITCH_UNAVAILABLE, 422);
  }
}
