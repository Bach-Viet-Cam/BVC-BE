import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import LocalStorageDriver from './LocalStorageDriver.ts';
import StorageService from './StorageService.ts';

test('UTC-STG-001 - first driver access creates LocalStorageDriver', () => {
  const original = StorageService.driverInstance;
  try {
    StorageService.driverInstance = null;
    assert.ok(StorageService.driver instanceof LocalStorageDriver);
  } finally {
    StorageService.driverInstance = original;
  }
});

test('UTC-STG-002 - driver access reuses the same instance', () => {
  const original = StorageService.driverInstance;
  try {
    StorageService.driverInstance = null;
    const first = StorageService.driver;
    const second = StorageService.driver;
    assert.strictEqual(first, second);
  } finally {
    StorageService.driverInstance = original;
  }
});

test('UTC-STG-003 - driver getter returns the injected fake', () => {
  const original = StorageService.driverInstance;
  try {
    const fake = {} as LocalStorageDriver;
    StorageService.driverInstance = fake;
    assert.strictEqual(StorageService.driver, fake);
  } finally {
    StorageService.driverInstance = original;
  }
});

test('UTC-STG-004 - deleteQuietly delegates to driver', async () => {
  const original = StorageService.driverInstance;
  let deletedKey = '';
  try {
    const fake = {
      deleteObject: async (key: string) => {
        deletedKey = key;
      }
    } as unknown as LocalStorageDriver;
    StorageService.driverInstance = fake;
    await assert.doesNotReject(StorageService.deleteQuietly('a.bin'));
    assert.equal(deletedKey, 'a.bin');
  } finally {
    StorageService.driverInstance = original;
  }
});

test('UTC-STG-005 - deleteQuietly swallows driver errors', async () => {
  const original = StorageService.driverInstance;
  const warn = mock.method(console, 'warn', () => {});
  try {
    const fake = {
      deleteObject: async () => {
        throw new Error('boom');
      }
    } as unknown as LocalStorageDriver;
    StorageService.driverInstance = fake;
    // R1: tưởng lỗi được ném ra
    await assert.doesNotReject(StorageService.deleteQuietly('a.bin'));
    assert.equal(warn.mock.calls.length, 1);
    assert.ok(String(warn.mock.calls[0].arguments[0]).includes('[storage] Could not delete object a.bin'));
  } finally {
    StorageService.driverInstance = original;
    warn.mock.restore();
  }
});

test('UTC-STG-006 - deleteQuietly swallows invalid key errors', async () => {
  const original = StorageService.driverInstance;
  const warn = mock.method(console, 'warn', () => {});
  try {
    const fake = {
      deleteObject: async () => {
        throw new Error('Invalid storage key.');
      }
    } as unknown as LocalStorageDriver;
    StorageService.driverInstance = fake;
    await assert.doesNotReject(StorageService.deleteQuietly('../secret.env'));
    assert.equal(warn.mock.calls.length, 1);
    assert.ok(String(warn.mock.calls[0].arguments[0]).includes('[storage] Could not delete object ../secret.env'));
  } finally {
    StorageService.driverInstance = original;
    warn.mock.restore();
  }
});
