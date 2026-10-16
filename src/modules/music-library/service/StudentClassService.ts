type ActiveInstrumentResolver = (studentId: string) => Promise<string | null>;

// Bridge to M03 (classes). Each class teaches exactly one instrument; M02 only needs the instrument of the
// student's active class (R-07). Until M03 registers its resolver, no class instrument is known.
export default class StudentClassService {
  static activeInstrumentResolver: ActiveInstrumentResolver = async () => null;

  static useActiveInstrumentResolver(resolver: ActiveInstrumentResolver): void {
    StudentClassService.activeInstrumentResolver = resolver;
  }

  static async findActiveInstrumentId(studentId: string): Promise<string | null> {
    return StudentClassService.activeInstrumentResolver(studentId);
  }
}
