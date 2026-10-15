export default class ClassModel {
  static readonly activeMemberFilter = { removedAt: null };

  static readonly classSelect = {
    id: true,
    name: true,
    cohort: true,
    description: true,
    instrumentId: true,
    lecturerId: true,
    startDate: true,
    endDate: true,
    status: true,
    endedAt: true,
    createdAt: true,
    instrument: { select: { id: true, name: true } },
    _count: { select: { members: { where: ClassModel.activeMemberFilter } } }
  };

  static readonly memberSelect = {
    id: true,
    joinedAt: true,
    student: { select: { id: true, username: true, email: true, studentCode: true, status: true } }
  };

  static readonly existingUserSelect = { id: true, email: true, studentCode: true, role: true };

  static readonly importLogSelect = {
    id: true,
    classId: true,
    lecturerId: true,
    fileName: true,
    status: true,
    totalRows: true,
    rows: true
  };
}
