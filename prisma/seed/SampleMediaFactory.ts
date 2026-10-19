import { PDFDocument, StandardFonts } from 'pdf-lib';

// Generates small but valid media files for seed data and tests
export default class SampleMediaFactory {
  // 1×1 PNG
  static readonly tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  // 16-bit mono PCM WAV with a sine tone
  static createWav(durationSec: number, frequencyHz: number = 440, sampleRate: number = 8000): Buffer {
    const sampleCount = Math.round(durationSec * sampleRate);
    const dataSize = sampleCount * 2;
    const wavBuffer = Buffer.alloc(44 + dataSize);
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(36 + dataSize, 4);
    wavBuffer.write('WAVE', 8);
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20);
    wavBuffer.writeUInt16LE(1, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(sampleRate * 2, 28);
    wavBuffer.writeUInt16LE(2, 32);
    wavBuffer.writeUInt16LE(16, 34);
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(dataSize, 40);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const amplitude = Math.sin((2 * Math.PI * frequencyHz * sampleIndex) / sampleRate) * 8000;
      wavBuffer.writeInt16LE(Math.round(amplitude), 44 + sampleIndex * 2);
    }
    return wavBuffer;
  }

  // Standard PDF fonts only support Latin-1, so titles are passed without diacritics
  static async createPdf(asciiTitle: string, pageCount: number = 2): Promise<Buffer> {
    const pdfDocument = await PDFDocument.create();
    const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = pdfDocument.addPage([595, 842]);
      page.drawText(`${asciiTitle} - ${pageNumber}/${pageCount}`, { x: 60, y: 780, size: 20, font });
      for (let staffIndex = 0; staffIndex < 8; staffIndex += 1) {
        for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
          const lineY = 700 - staffIndex * 80 - lineIndex * 8;
          page.drawLine({ start: { x: 60, y: lineY }, end: { x: 535, y: lineY }, thickness: 0.6 });
        }
      }
    }
    return Buffer.from(await pdfDocument.save());
  }
}
