import AppError from '../../../utils/AppError.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeResultDTO from '../dto/PracticeResultDTO.ts';
import SubmissionCompareDTO from '../dto/SubmissionCompareDTO.ts';
import PracticeResultRepository from '../repository/PracticeResultRepository.ts';
import CompareSegmentMatcherService from './CompareSegmentMatcherService.ts';
import PitchChartService from './PitchChartService.ts';

const { messages } = PracticeConstant;

interface SubmissionCompareDependencies {
  repository?: PracticeResultRepository;
  pitchCharts?: PitchChartService;
}

// UC-04: two finished submissions of the same sheet, their pitch lines on one timeline and their labelled error segments
export default class SubmissionCompareService {
  private readonly repository: PracticeResultRepository;
  private readonly pitchCharts: PitchChartService;
  private readonly resultDto = new PracticeResultDTO();
  private readonly compareDto = new SubmissionCompareDTO();

  constructor(dependencies: SubmissionCompareDependencies = {}) {
    this.repository = dependencies.repository ?? new PracticeResultRepository();
    this.pitchCharts = dependencies.pitchCharts ?? new PitchChartService(this.repository);
  }

  async compare(studentId: string, a: string, b: string): Promise<Practice.SubmissionCompareDTO> {
    const [first, second] = await Promise.all([this.repository.findOwnedResult(a, studentId), this.repository.findOwnedResult(b, studentId)]);
    if (!first || !second) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    if (first.status !== 'COMPLETED' || second.status !== 'COMPLETED') throw AppError.conflict(messages.RESULT_PROCESSING);
    if (!first.sheetMusicId || first.sheetMusicId !== second.sheetMusicId || !first.sheetMusic || !second.sheetMusic) {
      throw AppError.badRequest(messages.COMPARE_DIFFERENT_SHEET);
    }
    // The order the student picked does not matter: the earlier submission is always "older"
    const [olderRecord, newerRecord] = first.createdAt <= second.createdAt ? [first, second] : [second, first];
    const olderIssues = this.toIssues(olderRecord);
    const newerIssues = this.toIssues(newerRecord);
    const [olderChart, newerChart, olderAttempt, newerAttempt] = await Promise.all([
      this.getChart(olderRecord, olderIssues), this.getChart(newerRecord, newerIssues),
      this.repository.countCompletedUntil(olderRecord), this.repository.countCompletedUntil(newerRecord)
    ]);
    const { segments, noSegmentsToCompare } = CompareSegmentMatcherService.match(olderIssues, newerIssues);
    return {
      piece: newerRecord.piece,
      sheetMusic: { id: newerRecord.sheetMusic!.id, name: newerRecord.sheetMusic!.name },
      older: this.compareDto.toSide(olderRecord, olderAttempt),
      newer: this.compareDto.toSide(newerRecord, newerAttempt),
      chart: SubmissionCompareDTO.mergeCharts(olderChart, newerChart),
      segments,
      noSegmentsToCompare
    };
  }

  private toIssues(record: Practice.ResultRecord): Practice.ResultIssueDTO[] {
    return this.resultDto.toIssues(this.resultDto.parseAnalysis(record.result));
  }

  // MSG-26 names the submission whose chart is missing so the screen can say which one
  private async getChart(record: Practice.ResultRecord, issues: Practice.ResultIssueDTO[]): Promise<Practice.PitchChartDTO> {
    try {
      return await this.pitchCharts.getChart(record, issues);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 422) {
        throw new AppError(messages.PITCH_UNAVAILABLE, 422, { details: { submissionId: record.id } });
      }
      throw error;
    }
  }
}
