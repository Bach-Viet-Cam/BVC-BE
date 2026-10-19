export default class AdminStatsDTO {
  static toRecentUser(user: Backend.AdminRecentUserRecord): Backend.AdminRecentUser {
    return { ...user, createdAt: user.createdAt.toISOString() };
  }

  static toFileName(fileUrl: string | null, fallback: string): string {
    const name = fileUrl ? fileUrl.split('/').pop() : '';
    return name || fallback;
  }

  static toQueueItem(submission: Backend.SubmissionBrief, now: Date): Backend.AdminQueueItem {
    return {
      id: submission.id,
      fileName: AdminStatsDTO.toFileName(submission.fileUrl, submission.assignment.title),
      studentName: submission.student.username,
      waitSeconds: Math.max(0, Math.floor((now.getTime() - submission.createdAt.getTime()) / 1000))
    };
  }

  static toFailure(submission: Backend.SubmissionBrief): Backend.AdminFailureItem {
    const fileName = AdminStatsDTO.toFileName(submission.fileUrl, submission.assignment.title);
    return {
      id: submission.id,
      occurredAt: submission.createdAt.toISOString(),
      message: `Phân tích thất bại: ${fileName} (${submission.student.username})`
    };
  }
}
