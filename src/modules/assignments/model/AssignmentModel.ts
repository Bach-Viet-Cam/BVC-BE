export default class AssignmentModel {
  static readonly assignmentSelect = {
    id: true,
    classId: true,
    status: true,
    deletedAt: true,
    publishedAt: true,
    closedAt: true,
    updatedAt: true,
    class: { select: { id: true, name: true, status: true, instrumentId: true, lecturerId: true } },
    currentVersion: {
      select: {
        id: true,
        version: true,
        title: true,
        description: true,
        kind: true,
        requiredBpm: true,
        piece: { select: { id: true, title: true, defaultBpm: true, isVisible: true } }
      }
    }
  };
}
