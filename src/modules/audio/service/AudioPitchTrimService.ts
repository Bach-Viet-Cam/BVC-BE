import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import EnvConfig from '../../../config/EnvConfig.ts';
import AudioConstant from '../constant/AudioConstant.ts';

const execFileAsync = promisify(execFile);
const PITCH = AudioConstant.pitchTrim;

interface TrimRange { startSec: number; endSec: number; }

// Cắt phần không có cao độ (im lặng, tiếng ồn, tiếng gõ) ở đầu/cuối audio. Mọi lỗi đều không chặn upload: file gốc được giữ nguyên.
export default class AudioPitchTrimService {
  constructor(private readonly ffmpegPath: string = EnvConfig.ffmpegPath) {}

  // Cắt tại chỗ; trả về true khi file đã được thay bằng bản đã cắt. `extension` là wav, mp3 hoặc m4a (không có dấu chấm).
  // `edges` = 'both' cắt cả hai đầu, 'end' chỉ cắt phần cuối (bản ghi âm trực tiếp giữ nguyên phần đầu).
  async trimFile(filePath: string, extension: string, edges: Audio.TrimEdges = 'both'): Promise<boolean> {
    const codecArgs = AudioConstant.trimCodecArgs[extension];
    if (!codecArgs) return false;
    const trimmedPath = `${filePath}.trimmed.${extension}`;
    try {
      const range = this.findPitchedRange(await this.decodeSamples(filePath), edges);
      if (!range) return false;
      await execFileAsync(this.ffmpegPath, this.buildCutArguments(filePath, trimmedPath, range, codecArgs), {
        timeout: AudioConstant.trimTimeoutMs, windowsHide: true
      });
      if ((await stat(trimmedPath)).size < AudioConstant.minTrimmedBytes) return false;
      await rename(trimmedPath, filePath);
      return true;
    } catch {
      console.error('Không thể cắt audio theo cao độ, giữ nguyên file gốc.');
      return false;
    } finally {
      await unlink(trimmedPath).catch(() => undefined);
    }
  }

  // Dùng cho storage chỉ cung cấp buffer; trả về buffer đã cắt, hoặc null khi giữ nguyên bản gốc.
  async trimBuffer(content: Buffer, extension: string, edges: Audio.TrimEdges = 'both'): Promise<Buffer | null> {
    const directory = await mkdtemp(path.join(os.tmpdir(), AudioConstant.trimTemporaryPrefix));
    try {
      const filePath = path.join(directory, `source.${extension}`);
      await writeFile(filePath, content);
      return (await this.trimFile(filePath, extension, edges)) ? await readFile(filePath) : null;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  // Giải mã về PCM mono 16-bit ở tần số lấy mẫu cố định để dò cao độ
  private async decodeSamples(filePath: string): Promise<Float32Array> {
    const { stdout } = await execFileAsync(this.ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', String(PITCH.sampleRate), '-f', 's16le', '-'
    ], { encoding: 'buffer', maxBuffer: PITCH.maxDecodedBytes, timeout: AudioConstant.trimTimeoutMs, windowsHide: true });
    const samples = new Float32Array(Math.floor(stdout.length / 2));
    for (let index = 0; index < samples.length; index += 1) samples[index] = stdout.readInt16LE(index * 2) / 32768;
    return samples;
  }

  // Trả về khoảng giữ lại, hoặc null khi không có gì đáng cắt (không tìm thấy cao độ hoặc phần cắt quá ngắn)
  private findPitchedRange(samples: Float32Array, edges: Audio.TrimEdges): TrimRange | null {
    const durationSec = samples.length / PITCH.sampleRate;
    const frameCount = Math.floor((samples.length - PITCH.frameSize) / PITCH.hopSize) + 1;
    if (frameCount < PITCH.minPitchedFrames) return null;
    const lastFrame = this.findLastPitchedFrame(samples, frameCount);
    if (lastFrame === null) return null;
    const firstFrame = edges === 'both' ? this.findFirstPitchedFrame(samples, frameCount) : null;
    const startSec = firstFrame === null ? 0 : Math.max(0, (firstFrame * PITCH.hopSize) / PITCH.sampleRate - PITCH.paddingStartSec);
    const endSec = Math.min(durationSec, (lastFrame * PITCH.hopSize + PITCH.frameSize) / PITCH.sampleRate + PITCH.paddingEndSec);
    if (endSec <= startSec) return null;
    if (startSec < PITCH.minCutSec && durationSec - endSec < PITCH.minCutSec) return null;
    return { startSec, endSec };
  }

  // Khung đầu tiên của chuỗi khung liên tiếp có cao độ, chỉ dò trong giới hạn thời gian để không chặn event loop quá lâu
  private findFirstPitchedFrame(samples: Float32Array, frameCount: number): number | null {
    const scanLimit = Math.min(frameCount, this.getMaxScanFrames());
    let runLength = 0;
    for (let frame = 0; frame < scanLimit; frame += 1) {
      runLength = this.isPitchedFrame(samples, frame * PITCH.hopSize) ? runLength + 1 : 0;
      if (runLength >= PITCH.minPitchedFrames) return frame - runLength + 1;
    }
    return null;
  }

  private findLastPitchedFrame(samples: Float32Array, frameCount: number): number | null {
    const scanLimit = Math.max(0, frameCount - this.getMaxScanFrames());
    let runLength = 0;
    for (let frame = frameCount - 1; frame >= scanLimit; frame -= 1) {
      runLength = this.isPitchedFrame(samples, frame * PITCH.hopSize) ? runLength + 1 : 0;
      if (runLength >= PITCH.minPitchedFrames) return frame + runLength - 1;
    }
    return null;
  }

  private getMaxScanFrames(): number {
    return Math.ceil((PITCH.maxScanSec * PITCH.sampleRate) / PITCH.hopSize);
  }

  // YIN: khung đủ to và có chu kỳ rõ (hiệu số chuẩn hóa dưới ngưỡng) trong dải tần nhạc cụ thì coi là có cao độ
  private isPitchedFrame(samples: Float32Array, offset: number): boolean {
    if (this.getFrameLevelDb(samples, offset) < PITCH.minLevelDb) return false;
    const minLag = Math.floor(PITCH.sampleRate / PITCH.maxHz);
    const maxLag = Math.ceil(PITCH.sampleRate / PITCH.minHz);
    const windowSize = PITCH.frameSize - maxLag;
    let cumulativeDifference = 0;
    for (let lag = 1; lag <= maxLag; lag += 1) {
      let difference = 0;
      for (let index = 0; index < windowSize; index += 1) {
        const delta = samples[offset + index] - samples[offset + index + lag];
        difference += delta * delta;
      }
      cumulativeDifference += difference;
      if (lag >= minLag && cumulativeDifference > 0 && (difference * lag) / cumulativeDifference < PITCH.yinThreshold) return true;
    }
    return false;
  }

  private getFrameLevelDb(samples: Float32Array, offset: number): number {
    let energy = 0;
    for (let index = 0; index < PITCH.frameSize; index += 1) energy += samples[offset + index] * samples[offset + index];
    const rms = Math.sqrt(energy / PITCH.frameSize);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  private buildCutArguments(inputPath: string, outputPath: string, range: TrimRange, codecArgs: readonly string[]): string[] {
    const filter = `atrim=start=${range.startSec.toFixed(3)}:end=${range.endSec.toFixed(3)},asetpts=PTS-STARTPTS`;
    return ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-vn', '-af', filter, ...codecArgs, outputPath];
  }
}
