import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
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
  isActiveMember?: (classId: string, studentId: string) => Promise<boolean>;
}

interface ViewableResult {
  record: Practice.ResultRecord;
  review: Practice.LecturerReviewDTO | null;
}

// M01 results screen (UC 1.2). Each card has its own endpoint so a slow or missing part never blanks the screen.
export default class PracticeResultService {
  private readonly repository: PracticeResultRepository;
  private readonly pitchCharts: PitchChartService;
  private readonly classRank: ClassRankService;
  private readonly createReadUrl: (storageKey: string) => string;
  private readonly isActiveMember: (classId: string, studentId: string) => Promise<boolean>;
  private readonly dto = new PracticeResultDTO();

  constructor(dependencies: PracticeResultDependencies = {}) {
    this.repository = dependencies.repository ?? new PracticeResultRepository();
    this.pitchCharts = dependencies.pitchCharts ?? new PitchChartService(this.repository);
    this.classRank = dependencies.classRank ?? new ClassRankService();
    this.createReadUrl = dependencies.createReadUrl ?? ((storageKey) => StorageService.driver.createReadUrl(storageKey));
    this.isActiveMember = dependencies.isActiveMember ?? (async (classId, studentId) => (await MemberRepository.findActiveMembership(classId, studentId)) !== null);
  }

  // Unfinished submissions get only their identity; the FE sends the student back to the processing screen
  // A lecturer of the submission's class also gets the comment box state (lecturerReview).
  async getResult(viewer: Practice.ResultViewer, submissionId: string): Promise<Practice.ResultDTO> {
    const { record, review } = await this.findViewable(viewer, submissionId);
    const attemptNo = record.status === 'COMPLETED' ? await this.repository.countCompletedUntil(record) : 0;
    const result = this.dto.toResult(record, attemptNo, this.toAudio(record));
    return review ? { ...result, lecturerReview: review } : result;
  }

  async getHistory(viewer: Practice.ResultViewer, submissionId: string): Promise<Practice.ResultHistoryDTO> {
    const record = await this.findCompleted(viewer, submissionId);
    const [attempts, totalAttempts] = await Promise.all([
      this.repository.findCompletedAttempts(record, PracticeConstant.resultHistoryLimit),
      this.repository.countCompletedUntil(record)
    ]);
    return this.dto.toHistory(record, attempts.reverse(), totalAttempts);
  }

  // Only assignment submissions have a class to compare with; null hides the card
  async getClassRank(studentId: string, submissionId: string): Promise<Practice.ClassRankDTO | null> {
    const record = await this.findCompleted({ userId: studentId, role: AuthConstant.roles.STUDENT }, submissionId);
    if (!record.assignment || record.accuracy === null) return null;
    const peerScores = await this.repository.findClassPeerBest(record.assignment.classId, record.assignment.id, record.studentId);
    return this.classRank.calculate(record.assignment.class.name, record.accuracy, peerScores);
  }

  async getPitchChart(viewer: Practice.ResultViewer, submissionId: string): Promise<Practice.PitchChartDTO> {
    const record = await this.findCompleted(viewer, submissionId);
    return this.pitchCharts.getChart(record, this.dto.toIssues(this.dto.parseAnalysis(record.result)));
  }

  // The owner always sees their submission; a lecturer only an assignment submission of a class they teach.
  // Anyone else gets 404 so the submission's existence is not leaked.
  private async findViewable(viewer: Practice.ResultViewer, submissionId: string): Promise<ViewableResult> {
    const record = await this.repository.findResultById(submissionId);
    if (!record) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    if (record.studentId === viewer.userId) return { record, review: null };
    if (viewer.role !== AuthConstant.roles.TEACHER) throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);

    const context = await this.repository.findReviewContext(submissionId);
    const assignment = context?.assignment;
    if (!context || !assignment || assignment.deletedAt || !ClassAccessService.isClassLecturer(assignment.class, viewer.userId)) {
      throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    }
    // Same lock as saving a comment (A17/A18): finished class or a student who left.
    const [isMember, attemptNo] = await Promise.all([
      this.isActiveMember(assignment.classId, context.studentId),
      this.repository.countAttemptsUntil(record)
    ]);
    const canComment = assignment.class.status === 'ACTIVE' && isMember;
    return {
      record,
      review: {
        comment: context.comment ? { content: context.comment.content, updatedAt: context.comment.updatedAt.toISOString() } : null,
        canComment,
        student: { id: context.student.id, fullName: context.student.username, studentCode: context.student.studentCode },
        classId: assignment.classId,
        attemptNo
      }
    };
  }

  private async findCompleted(viewer: Practice.ResultViewer, submissionId: string): Promise<Practice.ResultRecord> {
    const { record } = await this.findViewable(viewer, submissionId);
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
