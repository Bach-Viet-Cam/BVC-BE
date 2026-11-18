// Rules for the student stats screens: who may write the overall evaluation and which class a student sees first.
export default class StudentStatsPolicyService {
  // Same lock as submission comments (A17/A18): a finished class or a student who left is read-only.
  static canEvaluate(classStatus: Backend.ClassStatus, isActiveMember: boolean): boolean {
    return classStatus === 'ACTIVE' && isActiveMember;
  }

  static pickDefaultClass(classes: Array<{ id: string; status: Backend.ClassStatus; startDate: Date }>): string | null {
    const newestFirst = [...classes].sort((left, right) => right.startDate.getTime() - left.startDate.getTime());
    return (newestFirst.find((classItem) => classItem.status === 'ACTIVE') ?? newestFirst[0])?.id ?? null;
  }
}
