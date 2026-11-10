import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import EnvConfig from '../../../config/EnvConfig.ts';
import AudioConstant from '../constant/AudioConstant.ts';

const execFileAsync = promisify(execFile);

// Cắt khoảng lặng ở đầu và cuối audio bằng ffmpeg. Mọi lỗi đều không chặn upload: file gốc được giữ nguyên.
export default class AudioSilenceTrimService {
  constructor(private readonly ffmpegPath: string = EnvConfig.ffmpegPath) {}

  // Cắt tại chỗ; trả về true khi file đã được thay bằng bản đã cắt. `extension` là wav, mp3 hoặc m4a (không có dấu chấm).
  async trimFile(filePath: string, extension: string): Promise<boolean> {
    const codecArgs = AudioConstant.trimCodecArgs[extension];
    if (!codecArgs) return false;
    const trimmedPath = `${filePath}.trimmed.${extension}`;
    try {
      await execFileAsync(this.ffmpegPath, this.buildArguments(filePath, trimmedPath, codecArgs), {
        timeout: AudioConstant.trimTimeoutMs, windowsHide: true
      });
      if ((await stat(trimmedPath)).size < AudioConstant.minTrimmedBytes) return false;
      await rename(trimmedPath, filePath);
      return true;
    } catch {
      console.error('Không thể cắt khoảng lặng audio, giữ nguyên file gốc.');
      return false;
    } finally {
      await unlink(trimmedPath).catch(() => undefined);
    }
  }

  // Dùng cho storage chỉ cung cấp buffer; trả về buffer đã cắt, hoặc null khi giữ nguyên bản gốc.
  async trimBuffer(content: Buffer, extension: string): Promise<Buffer | null> {
    const directory = await mkdtemp(path.join(os.tmpdir(), AudioConstant.trimTemporaryPrefix));
    try {
      const filePath = path.join(directory, `source.${extension}`);
      await writeFile(filePath, content);
      return (await this.trimFile(filePath, extension)) ? await readFile(filePath) : null;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  // Cắt đầu, đảo chiều rồi cắt tiếp (tức là cắt cuối), đảo lại; start_silence giữ đoạn đệm quanh tiếng
  private buildArguments(inputPath: string, outputPath: string, codecArgs: readonly string[]): string[] {
    const trimStart = `silenceremove=start_periods=1:start_threshold=${AudioConstant.silenceThresholdDb}dB:start_silence=${AudioConstant.silencePaddingSec}`;
    return ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-vn', '-af', `${trimStart},areverse,${trimStart},areverse`, ...codecArgs, outputPath];
  }
}
