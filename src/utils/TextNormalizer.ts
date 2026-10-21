export default class TextNormalizer {
  // "Lý Ngựa Ô" → "ly ngua o", "Đàn bầu" → "dan bau"
  static normalize(text: string | null | undefined): string {
    return (text ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  static toSearchTokens(text: string | null | undefined): string[] {
    return TextNormalizer.normalize(text).split(' ').filter(Boolean);
  }
}
