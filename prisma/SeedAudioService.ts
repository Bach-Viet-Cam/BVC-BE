import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default class SeedAudioService {
  private static readonly sampleRate = 44100;
  private static readonly bytesPerSample = 2;
  private static readonly headerSize = 44;

  static writeTone(filePath: string, frequency: number, durationSec: number): void {
    const sampleCount = Math.floor(durationSec * SeedAudioService.sampleRate);
    const dataSize = sampleCount * SeedAudioService.bytesPerSample;
    const audio = Buffer.alloc(SeedAudioService.headerSize + dataSize);

    audio.write('RIFF', 0);
    audio.writeUInt32LE(36 + dataSize, 4);
    audio.write('WAVE', 8);
    audio.write('fmt ', 12);
    audio.writeUInt32LE(16, 16);
    audio.writeUInt16LE(1, 20);
    audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(SeedAudioService.sampleRate, 24);
    audio.writeUInt32LE(SeedAudioService.sampleRate * SeedAudioService.bytesPerSample, 28);
    audio.writeUInt16LE(SeedAudioService.bytesPerSample, 32);
    audio.writeUInt16LE(16, 34);
    audio.write('data', 36);
    audio.writeUInt32LE(dataSize, 40);

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const phase = (2 * Math.PI * frequency * sampleIndex) / SeedAudioService.sampleRate;
      const amplitude = Math.round(Math.sin(phase) * 0.5 * 32767);
      audio.writeInt16LE(amplitude, SeedAudioService.headerSize + sampleIndex * SeedAudioService.bytesPerSample);
    }

    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, audio);
  }
}
