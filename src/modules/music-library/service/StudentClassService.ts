import ClassMembershipRepository from '../repository/ClassMembershipRepository.ts';

type ActiveInstrumentResolver = (studentId: string) => Promise<string | null>;

// Bridge to M03 (classes): M02 only needs the instrument of the student's active class (R-07).
// Tests can swap the resolver to avoid seeding classes.
export default class StudentClassService {
  static activeInstrumentResolver: ActiveInstrumentResolver = ClassMembershipRepository.findActiveInstrumentId;

  static useActiveInstrumentResolver(resolver: ActiveInstrumentResolver): void {
    StudentClassService.activeInstrumentResolver = resolver;
  }

  static async findActiveInstrumentId(studentId: string): Promise<string | null> {
    return StudentClassService.activeInstrumentResolver(studentId);
  }
}
