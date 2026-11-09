import DateTimeUtil from '../../../utils/DateTimeUtil.ts';

export default class ClassDTO {
  static toClassSummaryDTO(classRecord: Backend.ClassRecord, viewerId: string): Backend.ClassSummaryDTO {
    return {
      id: classRecord.id,
      name: classRecord.name,
      cohort: classRecord.cohort,
      status: classRecord.status,
      instrument: { id: classRecord.instrument.id, name: classRecord.instrument.name },
      startDate: DateTimeUtil.toIsoDate(classRecord.startDate),
      endDate: DateTimeUtil.toIsoDate(classRecord.endDate),
      memberCount: classRecord._count.members,
      isPrimaryLecturer: classRecord.ownerId === viewerId
    };
  }

  static toClassDetailDTO(classRecord: Backend.ClassRecord, viewerId: string, now: Date = new Date()): Backend.ClassDetailDTO {
    const summary = ClassDTO.toClassSummaryDTO(classRecord, viewerId);
    return {
      ...summary,
      description: classRecord.description,
      hasStarted: DateTimeUtil.hasStarted(summary.startDate, now),
      isReadOnly: classRecord.status === 'ENDED',
      endedAt: classRecord.endedAt ? classRecord.endedAt.toISOString() : null,
      owner: ClassDTO.toLecturerDTO(classRecord.owner),
      coLecturers: classRecord.coLecturers.map((coLecturer) => ClassDTO.toLecturerDTO(coLecturer.lecturer))
    };
  }

  static toLecturerDTO(lecturer: { id: string; username: string; email: string }): Backend.LecturerDTO {
    return { id: lecturer.id, fullName: lecturer.username, email: lecturer.email };
  }

  static toMemberDTO(member: Backend.MemberRecord): Backend.MemberDTO {
    return {
      studentId: member.user.id,
      fullName: member.user.username,
      studentCode: member.user.studentCode,
      email: member.user.email,
      accountStatus: member.user.status,
      joinedAt: member.joinedAt.toISOString()
    };
  }

  static toImportPreviewDTO(
    log: { id: string; fileName: string; status: Backend.ImportLogStatus },
    rows: Backend.ValidatedStudentRow[]
  ): Backend.ImportPreviewDTO {
    const validRows = rows.filter((row) => row.isValid).length;
    return {
      logId: log.id,
      fileName: log.fileName,
      status: log.status,
      totalRows: rows.length,
      validRows,
      errorRows: rows.length - validRows,
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        studentCode: row.studentCode,
        fullName: row.fullName,
        email: row.email,
        isValid: row.isValid,
        reason: row.reason
      }))
    };
  }
}
