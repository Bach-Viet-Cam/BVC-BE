/* eslint-disable @typescript-eslint/no-explicit-any -- Express request / response are faked with plain objects */
// Report 5.1 Unit Test – new sheet "CallbackSecretMiddleware": cases UTC-CB-001… (IDs match the workbook).
// Covers requireCallbackSecret: the shared-secret header the Rhythm service sends on callbacks. EnvConfig is overridden per case.
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import EnvConfigClass from '../../src/config/EnvConfig.ts';
import { requireCallbackSecret } from '../../src/modules/practice/middleware/CallbackSecretMiddleware.ts';

const { method, setValue, sheet, tc } = UnitTestKit;
const EnvConfig: any = EnvConfigClass;
const SECRET = 's3cret-callback';
const MESSAGE = 'Callback secret không hợp lệ.';

const call = (header: unknown, configured = SECRET) => {
  setValue(EnvConfig, 'aiCallbackSecret', configured);
  const calls: any[][] = [];
  const request: any = { headers: header === undefined ? {} : { 'x-callback-secret': header } };
  requireCallbackSecret(request, {} as any, (...args: unknown[]) => { calls.push(args); });
  return calls;
};
const rejected = (calls: any[][]) => {
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].statusCode, 401);
  assert.equal(calls[0][0].message, MESSAGE);
};
const R = UnitTestKit.R;

sheet('CallbackSecretMiddleware', 'CB', 'tests/unit/CallbackSecretMiddleware.test.ts');
method('requireCallbackSecret(request, response, next)');
tc('EnvConfig.aiCallbackSecret = "s3cret-callback"', '[EP] header x-callback-secret = "s3cret-callback"', R('next() is called once with no argument'), 'Normal', () => {
  const calls = call(SECRET);
  assert.deepEqual(calls, [[]]);
});
tc('EnvConfig.aiCallbackSecret = "s3cret-callback"', '[EP] header x-callback-secret missing', 'Return: N/A\nException: next(AppError(statusCode=401)) – "Callback secret không hợp lệ."\nLog Message: N/A', 'Abnormal', () => rejected(call(undefined)));
tc('EnvConfig.aiCallbackSecret = "s3cret-callback"', '[BVA] header x-callback-secret = "" (empty string)', 'Return: N/A\nException: next(AppError(statusCode=401)) – "Callback secret không hợp lệ."\nLog Message: N/A', 'Boundary', () => rejected(call('')));
tc('EnvConfig.aiCallbackSecret = "s3cret-callback"', '[EP] header = "s3cret-callbacX" (wrong secret, same length)', 'Return: N/A\nException: next(AppError(statusCode=401)) – "Callback secret không hợp lệ."\nLog Message: N/A', 'Abnormal', () => rejected(call('s3cret-callbacX')));
tc('EnvConfig.aiCallbackSecret = "s3cret-callback"', '[BVA] header one character shorter / longer than the secret', 'Return: N/A\nException: next(AppError(statusCode=401)) for both; timingSafeEqual is never reached with unequal lengths (no RangeError)\nLog Message: N/A', 'Boundary', () => {
  rejected(call(SECRET.slice(0, -1)));
  rejected(call(`${SECRET}x`));
});
tc('EnvConfig.aiCallbackSecret = "" (not configured)', '[BVA] header = "" while the configured secret is empty', 'Return: N/A\nException: next(AppError(statusCode=401)) – an empty secret is never valid\nLog Message: N/A', 'Boundary', () => rejected(call('', '')));
tc('EnvConfig.aiCallbackSecret = "s3cret-callback"', '[EG] header supplied as an array: ["s3cret-callback"] / ["s3cret-callback", "x"]', 'Return: ["s3cret-callback"] is accepted (String() joins it to the same text); ["s3cret-callback", "x"] → next(AppError 401)\nException: N/A\nLog Message: N/A', 'Abnormal', () => {
  assert.deepEqual(call([SECRET]), [[]]);
  rejected(call([SECRET, 'x']));
});
tc('EnvConfig.aiCallbackSecret = "s3cret-callback"', '[EG] correct secret followed by a space: "s3cret-callback "', 'Return: N/A\nException: next(AppError(statusCode=401)) – the header is not trimmed\nLog Message: N/A', 'Abnormal', () => rejected(call(`${SECRET} `)));
