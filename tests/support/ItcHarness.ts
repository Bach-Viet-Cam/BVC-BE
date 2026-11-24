import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import amqp from 'amqplib';
import pg from 'pg';

// Integration harness for Report-5.2 (sheet "Audio & Ensemble", ITC-AD and ITC-RT-018).
// The BE listens on a real port, the Rhythm service runs from its own virtualenv and both use the local RabbitMQ.
// Gemini is a local stub so no external service is called.
export interface ItcSettings {
  bePort: number;
  rhythmPort: number;
  geminiPort: number;
  internalKey: string;
  callbackSecret: string;
  rabbitUrl: string;
}

type GeminiMode = 'ok' | '503';

export default class ItcHarness {
  static readonly rhythmDirectory = path.resolve('..', 'BVC-Ryhthm-Service');
  static readonly evaluateQueue = 'rhythm.evaluate.v1';
  static rhythm: ChildProcess | null = null;
  static rhythmLog = '';
  static geminiMode: GeminiMode = 'ok';
  static geminiCalls = 0;
  private static geminiServer: http.Server | null = null;

  constructor(readonly settings: ItcSettings) {}

  get rhythmBase(): string {
    return `http://127.0.0.1:${this.settings.rhythmPort}`;
  }

  static rhythmDatabaseUrl(): string {
    if (process.env.RHYTHM_IT_DATABASE_URL) return process.env.RHYTHM_IT_DATABASE_URL;
    const envFile = path.join(ItcHarness.rhythmDirectory, '.env');
    const line = fs.existsSync(envFile)
      ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('RHYTHM_SERVICE_DATABASE_URL='))
      : undefined;
    const base = new URL((line?.split('=').slice(1).join('=') ?? 'postgresql+psycopg://postgres:postgres@localhost:5432/postgres').replace('postgresql+psycopg', 'postgresql'));
    base.pathname = '/bvc_rhythm_itc_be';
    return base.toString();
  }

  static async ensureRhythmDatabase(): Promise<string> {
    const url = new URL(ItcHarness.rhythmDatabaseUrl());
    const admin = new URL(url.toString());
    admin.pathname = '/postgres';
    const client = new pg.Client({ connectionString: admin.toString() });
    await client.connect();
    const name = url.pathname.slice(1);
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
    await client.end();
    return url.toString().replace('postgresql://', 'postgresql+psycopg://');
  }

  // ---------------------------------------------------------------- Gemini stub
  async startGemini(): Promise<void> {
    if (ItcHarness.geminiServer) return;
    ItcHarness.geminiServer = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        ItcHarness.geminiCalls += 1;
        if (ItcHarness.geminiMode === '503') {
          response.writeHead(503, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: { code: 503, message: 'stub 503', status: 'UNAVAILABLE' } }));
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Bạn giữ nhịp khá đều, hãy chú ý cao độ.' }] }, finishReason: 'STOP', index: 0 }] }));
      });
    });
    await new Promise<void>((resolve) => ItcHarness.geminiServer!.listen(this.settings.geminiPort, '127.0.0.1', resolve));
  }

  async stopGemini(): Promise<void> {
    const server = ItcHarness.geminiServer;
    ItcHarness.geminiServer = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ---------------------------------------------------------------- Rhythm process
  async startRhythm(overrides: Record<string, string> = {}): Promise<void> {
    await this.stopRhythm();
    const python = path.join(ItcHarness.rhythmDirectory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const work = path.resolve('storage-itc-rhythm');
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RHYTHM_SERVICE_')));
    const env: NodeJS.ProcessEnv = {
      ...inherited,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
      RHYTHM_SERVICE_APP_HOST: '127.0.0.1',
      RHYTHM_SERVICE_APP_PORT: String(this.settings.rhythmPort),
      RHYTHM_SERVICE_DATABASE_URL: await ItcHarness.ensureRhythmDatabase(),
      RHYTHM_SERVICE_RABBITMQ_URL: this.settings.rabbitUrl,
      RHYTHM_SERVICE_ARTIFACT_ROOT: path.join(work, 'artifacts'),
      RHYTHM_SERVICE_TEMP_DIRECTORY: path.join(work, 'tmp'),
      RHYTHM_SERVICE_INTERNAL_API_KEY: this.settings.internalKey,
      RHYTHM_SERVICE_CALLBACK_SECRET: this.settings.callbackSecret,
      RHYTHM_SERVICE_CALLBACK_ALLOWED_HOSTS: '127.0.0.1,localhost',
      RHYTHM_SERVICE_GEMINI_API_KEY: 'itc-be-gemini-key-0001',
      RHYTHM_SERVICE_OPENROUTER_API_KEY: '',
      RHYTHM_SERVICE_KEY_ENCRYPTION_SECRET: '',
      RHYTHM_SERVICE_GEMINI_MODEL: 'itc-gemini-model',
      RHYTHM_SERVICE_GEMINI_TIMEOUT_SECONDS: '20',
      RHYTHM_SERVICE_ALLOWED_HOSTS: '',
      GOOGLE_GEMINI_BASE_URL: `http://127.0.0.1:${this.settings.geminiPort}`,
      ...overrides
    };
    ItcHarness.rhythmLog = '';
    const child = spawn(python, ['-m', 'app.main'], { cwd: ItcHarness.rhythmDirectory, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk) => { ItcHarness.rhythmLog += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { ItcHarness.rhythmLog += chunk.toString(); });
    ItcHarness.rhythm = child;
    await ItcHarness.waitFor(async () => {
      if (child.exitCode !== null) throw new Error(`Rhythm exited early:\n${ItcHarness.rhythmLog.slice(-3000)}`);
      try {
        return (await fetch(`${this.rhythmBase}/health`)).ok;
      } catch {
        return false;
      }
    }, 120_000, 'Rhythm service');
  }

  async stopRhythm(): Promise<void> {
    const child = ItcHarness.rhythm;
    ItcHarness.rhythm = null;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    if (process.platform === 'win32' && child.pid) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
    await exited;
  }

  async rhythmGet(pathName: string): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${this.rhythmBase}${pathName}`, { headers: { Authorization: `Bearer ${this.settings.internalKey}` } });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  // ---------------------------------------------------------------- RabbitMQ
  async purgeQueues(): Promise<void> {
    const connection = await amqp.connect(this.settings.rabbitUrl);
    const channel = await connection.createChannel();
    for (const queue of ['rhythm.evaluate.v1', 'rhythm.evaluate.dlq', 'rhythm.template.analyze.v1', 'rhythm.template.analyze.dlq']) {
      try {
        await channel.checkQueue(queue);
        await channel.purgeQueue(queue);
      } catch {
        return connection.close().catch(() => undefined);
      }
    }
    await connection.close();
  }

  // Reads the next job of a queue and puts it back (the worker is stopped while this runs)
  async peekJob(queue: string = ItcHarness.evaluateQueue): Promise<Record<string, unknown> | null> {
    const connection = await amqp.connect(this.settings.rabbitUrl);
    const channel = await connection.createChannel();
    try {
      const message = await ItcHarness.waitFor(async () => (await channel.get(queue, { noAck: false })) || null, 30_000, `a job in ${queue}`);
      const job = JSON.parse(message.content.toString()) as Record<string, unknown>;
      channel.nack(message, false, true);
      return job;
    } finally {
      await channel.close().catch(() => undefined);
      await connection.close().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- utilities
  static async listen(app: http.RequestListener, port: number): Promise<http.Server> {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    return server;
  }

  static async close(server: http.Server | null): Promise<void> {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  static port(server: http.Server): number {
    return (server.address() as AddressInfo).port;
  }

  static async waitFor<T>(check: () => Promise<T | null | false | undefined>, timeoutMs: number, label: string, intervalMs = 500): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let last: unknown = null;
    while (Date.now() < deadline) {
      last = await check();
      if (last) return last as T;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}; last value: ${JSON.stringify(last)}`);
  }

  // 16-bit mono WAV of a pentatonic melody that the Rhythm pitch tracker can follow
  static melodyWav(seconds: number, options: { gain?: number; leadingSilenceSec?: number; trailingSilenceSec?: number; sampleRate?: number } = {}): Buffer {
    const sampleRate = options.sampleRate ?? 22050;
    const notes = [293.66, 329.63, 392, 440, 523.25, 440, 392, 329.63];
    const lead = Math.round((options.leadingSilenceSec ?? 0) * sampleRate);
    const tail = Math.round((options.trailingSilenceSec ?? 0) * sampleRate);
    const body = Math.round(seconds * sampleRate);
    const total = lead + body + tail;
    const noteLength = Math.round(0.5 * sampleRate);
    const buffer = Buffer.alloc(44 + total * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + total * 2, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(total * 2, 40);
    const gain = options.gain ?? 0.5;
    for (let index = 0; index < body; index += 1) {
      const noteIndex = Math.floor(index / noteLength);
      const position = index % noteLength;
      const frequency = notes[noteIndex % notes.length];
      const time = position / sampleRate;
      const envelope = Math.min(1, position / (noteLength / 8)) * Math.exp(-2.5 * (position / noteLength));
      const value = Math.sin(2 * Math.PI * frequency * time) + 0.4 * Math.sin(4 * Math.PI * frequency * time);
      buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * envelope * gain / 1.4)) * 32767), 44 + (lead + index) * 2);
    }
    return buffer;
  }

  // Leading silent samples of a 16-bit PCM WAV buffer (data chunk searched by name)
  static leadingSilenceSec(wav: Buffer): number {
    const dataOffset = wav.indexOf('data') + 8;
    const sampleRate = wav.readUInt32LE(24);
    for (let offset = dataOffset; offset + 1 < wav.length; offset += 2) {
      if (Math.abs(wav.readInt16LE(offset)) > 300) return (offset - dataOffset) / 2 / sampleRate;
    }
    return (wav.length - dataOffset) / 2 / sampleRate;
  }

  static durationSec(wav: Buffer): number {
    const dataOffset = wav.indexOf('data') + 8;
    return (wav.length - dataOffset) / 2 / wav.readUInt32LE(24);
  }

  static mp3(wav: Buffer): Buffer {
    const directory = fs.mkdtempSync(path.resolve('storage-itc-tmp-'));
    try {
      fs.writeFileSync(path.join(directory, 'in.wav'), wav);
      execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(directory, 'in.wav'), path.join(directory, 'out.mp3')]);
      return fs.readFileSync(path.join(directory, 'out.mp3'));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}
