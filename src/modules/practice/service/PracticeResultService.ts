import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeResultDTO from '../dto/PracticeResultDTO.ts';
import PracticeResultRepository from '../repository/PracticeResultRepository.ts';
import ClassRankService from './ClassRankService.ts';
import PitchChartService from './PitchChartService.ts';

const { messages } = PracticeConstant;

interface PracticeResultDependencies {
  repository?: PracticeResultRepository;
  pitchCharts?: PitchChartService;
  classRank?: ClassRankService;
  createReadUrl?: (storageKey: string) => string;
}

// M01 results screen (UC 1.2). Each card has its own endpoint so a slow or missing part never blanks the screen.
export default class PracticeResultService {
  private readonly repository: PracticeResultRepository;
  private readonly pitchCharts: PitchChartService;
  private readonly classRank: ClassRankService;
  private readonly createReadUrl: (storageKey: string) => string;
  private readonly dto = new PracticeResultDTO();

  constructor(dependencies: PracticeResultDependencies = {}) {
    this.repository = dependencies.repository ?? new PracticeResultRepository();
    this.pitchCharts = dependencies.pitchCharts ?? new PitchChartService(this.repository);
    this.classRank = dependencies.classRank ?? new ClassRankService();
    this.createReadUrl = dependencies.createReadUrl ?? ((storageKey) => StorageService.driver.createReadUrl(storageKey));
  }

  // Unfinished submissions get only their identity; the FE sends the student back to the processing screen
  async getResult(studentId: string, submissionId: string): Promise<Practice.ResultDTO> {
    const record = await this.findOwned(studentId, submissionId);
    const attemptNo = record.status === 'COMPLETED' ? await this.repository.countCompletedUntil(record) : 0;
    return this.dto.toResult(record, attemptNo, this.toAudio(record));
  }

  async getHistory(studentId: string, submissionId: string): Promise<Practice.ResultHistoryDTO> {
    const record = await this.findCompleted(studentId, submissionId);
    const [attempts, totalAttempts] = await Promise.all([
      this.repository.findCompletedAttempts(record, PracticeConstant.resultHistoryLimit),
      this.repository.countCompletedUntil(record)
    ]);
    return this.dto.toHistory(record, attempts.reverse(), totalAttempts);
  }

  // Only assignment submissions have a class to compare with; null hides the card
  async getClassRank(studentId: string, submissionId: string): Promise<Practice.ClassRankDTO | null> {
    const record = await this.findCompleted(studentId, submissionId);
    if (!record.assignment || record.accuracy === null) return null;
    const peerScores = await this.repository.findClassPeerBest(record.assignment.classId, record.assignment.id, record.studentId);
    return this.classRank.calculate(record.assignment.class.name, record.accuracy, peerScores);
  }

  async getPitchChart(studentId: string, submissionId: string): Promise<Practice.PitchChartDTO> {
    const record = await this.findCompleted(studentId, submissionId);
    return this.pitchCharts.getChart(record, this.dto.toIssues(this.dto.parseAnalysis(record.result)));
  }

  private async findOwned(studentId: string, submissionId: string): Promise<Practice.ResultRecord> {
    const record = await this.repository.findOwnedResult(submissionId, studentId);
    if (!record) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    return record;
  }

  private async findCompleted(studentId: string, submissionId: string): Promise<Practice.ResultRecord> {
    const record = await this.findOwned(studentId, submissionId);
    if (record.status !== 'COMPLETED') throw AppError.conflict(messages.RESULT_PROCESSING);
    return record;
  }

  private toAudio(record: Practice.ResultRecord): Practice.ResultDTO['audio'] {
    if (record.status !== 'COMPLETED') return { teacherUrl: null, studentUrl: null };
    const referenceAudio = record.sheetMusic?.referenceAudio;
    const upload = record.studentUpload;
    return {
      teacherUrl: referenceAudio?.status === 'READY' ? this.createReadUrl(referenceAudio.storageKey) : null,
      // GBR-62: the recording may already be deleted after the last failed retry or by cleanup
      studentUrl: upload && !record.fileDeletedAt && !upload.deletingAt ? upload.url : null
    };
  }
}
