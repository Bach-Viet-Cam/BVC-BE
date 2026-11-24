/* eslint-disable @typescript-eslint/no-explicit-any -- stubs replace static members of classes, so they are typed loosely */
// Helpers for the Report 5.1 unit test cases (Node test runner or Vitest) (same API as the draft kit in BVC-BE-unit-tests).
// - sheet(name, code, file, startAt): IDs of the following cases are UTC-<code>-<startAt + 1>, <startAt + 2> ...
// - tc(pre, input, expected, type, run): registers one Vitest case named "<ID> <method> | <input>"; pre / expected / type document the workbook row.
// - stub() / stubSync() / setValue() swap one static member for the current case and are restored in afterEach.
// - PrismaClientProvider.instance is replaced by a proxy that throws, so a unit test can never reach a database.
import assert from 'node:assert/strict';
import PrismaClientProvider from '../../../src/config/PrismaClient.ts';

// Runs under the Node test runner ("npx tsx --test <file>", output like the other src/**/*.test.ts files) and under Vitest.
const runner: any = process.env.VITEST ? await import('vitest') : await import('node:test');
const { afterEach, it } = runner;

type CaseType = 'Normal' | 'Abnormal' | 'Boundary';

const restores: Array<() => void> = [];
const state = { code: '', counter: 0, method: '' };

(PrismaClientProvider as any).instance = new Proxy({}, {
  get: (_target, key) => {
    if (key === 'then' || typeof key === 'symbol') return undefined;
    throw new Error(`Unstubbed Prisma access: PrismaClientProvider.instance.${String(key)}`);
  }
});
const guardedInstance = (PrismaClientProvider as any).instance;
afterEach(() => {
  while (restores.length) restores.pop()!();
  (PrismaClientProvider as any).instance = guardedInstance;
});

export default class UnitTestKit {
  static sheet(_name: string, code: string, _file: string, startAt = 0): void {
    Object.assign(state, { code, counter: startAt });
  }

  static method(name: string): void {
    state.method = name;
  }

  static tc(_pre: string, input: string, _expected: string, _type: CaseType, run: () => unknown): void {
    state.counter += 1;
    const id = `UTC-${state.code}-${String(state.counter).padStart(3, '0')}`;
    it(`${id} ${state.method} | ${input}`, async () => { await run(); });
  }

  static R(value: string, log = 'N/A'): string {
    return `Return: ${value}\nException: N/A\nLog Message: ${log}`;
  }

  static E(status: number, code: string | null, message: string, field?: string, log = 'N/A'): string {
    return `Return: N/A
Exception: AppError(statusCode=${status}${code ? `, code="${code}"` : ''}${field ? `, field="${field}"` : ''}) – "${message}"
Log Message: ${log}`;
  }

  static async expectAppError(action: () => unknown, status: number, code: string | null, message: string, field?: string): Promise<void> {
    try {
      await action();
    } catch (error) {
      const appError = error as { statusCode: number; code?: string; message: string; field?: string };
      assert.equal(appError.statusCode, status, `statusCode (${appError.message})`);
      assert.equal(appError.code ?? null, code);
      assert.equal(appError.message, message);
      assert.equal(appError.field, field);
      return;
    }
    throw new Error('Expected an AppError but nothing was thrown');
  }

  // Async stub: always returns a promise; returns the recorded calls
  static stub(target: any, name: string, impl: (...args: any[]) => unknown = () => undefined): any[][] {
    const previous = target[name];
    const calls: any[][] = [];
    target[name] = (...args: any[]) => {
      calls.push(args);
      try { return Promise.resolve(impl(...args)); } catch (error) { return Promise.reject(error); }
    };
    restores.push(() => { target[name] = previous; });
    return calls;
  }

  static stubSync(target: any, name: string, impl: (...args: any[]) => unknown = () => undefined): any[][] {
    const previous = target[name];
    const calls: any[][] = [];
    target[name] = (...args: any[]) => { calls.push(args); return impl(...args); };
    restores.push(() => { target[name] = previous; });
    return calls;
  }

  static setValue(target: any, name: string, value: unknown): void {
    const previous = target[name];
    target[name] = value;
    restores.push(() => { target[name] = previous; });
  }
}
