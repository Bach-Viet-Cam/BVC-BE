export default class AudioConstant {
  static readonly cleanupLockId = 7719321;
  static readonly maxPendingMessages = 100;
  static readonly maxFileBytes = 25 * 1024 * 1024;
  static readonly queue = 'rhythm.evaluate.v1';
  static readonly deadLetterQueue = 'rhythm.evaluate.dlq';
  static readonly instrumentCode = 'dan_bau';
  static readonly requestTimeoutMs = 10_000;
  static readonly orphanRetentionMs = 24 * 60 * 60 * 1000;
  static readonly temporaryDirectory = 'bvc-audio-uploads';
}
