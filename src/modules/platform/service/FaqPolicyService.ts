export default class FaqPolicyService {
  static questionKey(question: string): string {
    return question.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
  }
}
