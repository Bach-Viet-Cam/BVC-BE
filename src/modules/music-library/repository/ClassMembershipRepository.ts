import PrismaClientProvider from '../../../config/PrismaClient.ts';

// Read-only access to class data owned by M03
export default class ClassMembershipRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  // Each class teaches exactly one instrument: take the one of the student's most recently started active class
  static async findActiveInstrumentId(studentId: string): Promise<string | null> {
    const membership = await ClassMembershipRepository.client.classMember.findFirst({
      where: { userId: studentId, class: { status: 'ACTIVE' } },
      orderBy: { class: { startDate: 'desc' } },
      select: { class: { select: { instrumentId: true } } }
    });
    return membership?.class.instrumentId ?? null;
  }
}
