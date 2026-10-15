import DateTimeUtil from '../../../utils/DateTimeUtil.ts';

export default class ClassDTO {
  static toClassSummaryDTO(classRecord: Backend.ClassRecord): Backend.ClassSummaryDTO {
    return {
      id: classRecord.id,
      name: classRecord.name,
      cohort: classRecord.cohort,
      status: classRecord.status,
      instrument: { id: classRecord.instrument.id, name: classRecord.instrument.name },
      startDate: DateTimeUtil.toIsoDate(classRecord.startDate),
      endDate: DateTimeUtil.toIsoDate(classRecord.endDate),
      memberCount: classRecord._count.members
    };
  }

  static toClassDetailDTO(classRecord: Backend.ClassRecord, now: Date = new Date()): Backend.ClassDetailDTO {
    const summary = ClassDTO.toClassSummaryDTO(classRecord);
    return {
      ...summary,
      description: classRecord.description,
      hasStarted: DateTimeUtil.hasStarted(summary.startDate, now),
      isReadOnly: classRecord.status === 'FINISHED',
      endedAt: classRecord.endedAt ? classRecord.endedAt.toISOString() : null
    };
  }

  static toMemberDTO(member: Backend.MemberRecord): Backend.MemberDTO {
    return {
      studentId: member.student.id,
      fullName: member.student.username,
      studentCode: member.student.studentCode,
      email: member.student.email,
      accountStatus: member.student.status,
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
