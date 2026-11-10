export default class AudioConstant {
  static readonly cleanupLockId = 7719321;
  static readonly maxPendingMessages = 100;
  static readonly maxFileBytes = 25 * 1024 * 1024;
  static readonly queue = 'rhythm.evaluate.v1';
  static readonly deadLetterQueue = 'rhythm.evaluate.dlq';
  static readonly instrumentCode = 'dan_bau';
  static readonly requestTimeoutMs = 10_000;
  // A 5-minute recording's analysis file (two f0 tracks + alignment) is about 1 MB
  static readonly analysisMaxBytes = 5 * 1024 * 1024;
  // Platform instrument codes → Rhythm instrument ids; unknown codes are sent as is and Rhythm falls back
  // Short codes (DTR, DBA, ...) are kept as aliases for databases whose instrument codes are not renamed yet
  static readonly rhythmInstruments: Readonly<Record<string, string>> = Object.freeze({
    DTR: 'dan_tranh', DBA: 'dan_bau', DNH: 'dan_nhi', DSA: 'sao_truc', DTB: 'dan_ty_ba', DNG: 'dan_nguyet',
    DTR103: 'dan_tranh', DAN_TRANH: 'dan_tranh', 'dan-tranh': 'dan_tranh',
    DBA103: 'dan_bau', DAN_BAU: 'dan_bau', 'dan-bau': 'dan_bau',
    DNH103: 'dan_nhi', DAN_NHI: 'dan_nhi', 'dan-nhi': 'dan_nhi',
    DSA103: 'sao_truc', SAO_TRUC: 'sao_truc', 'sao-truc': 'sao_truc',
    DTB103: 'dan_ty_ba', TY_BA: 'dan_ty_ba', 'ty-ba': 'dan_ty_ba',
    DNG103: 'dan_nguyet', DAN_NGUYET: 'dan_nguyet', 'dan-nguyet': 'dan_nguyet'
  });
  static readonly orphanRetentionMs = 24 * 60 * 60 * 1000;
  static readonly temporaryDirectory = 'bvc-audio-uploads';
  // Cắt khoảng lặng đầu/cuối khi lưu audio: dưới ngưỡng này được coi là im lặng, vẫn giữ lại một đoạn đệm quanh tiếng
  static readonly silenceThresholdDb = -50;
  static readonly silencePaddingSec = 0.15;
  static readonly trimTimeoutMs = 60_000;
  static readonly trimTemporaryPrefix = 'bvc-audio-trim-';
  // Kết quả nhỏ hơn mức này nghĩa là ffmpeg đã cắt hết (bản thu im lặng) nên giữ nguyên bản gốc
  static readonly minTrimmedBytes = 1024;
  static readonly trimCodecArgs: Readonly<Record<string, readonly string[]>> = Object.freeze({
    wav: ['-c:a', 'pcm_s16le'],
    mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
    m4a: ['-c:a', 'aac', '-b:a', '192k']
  });
}
