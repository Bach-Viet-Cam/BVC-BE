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
  // Platform instrument codes → Rhythm instrument ids (identifier only); unknown codes are sent as is.
  // Rhythm takes pitch range and tolerance from the job's `instrument` block, not from this id.
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
  static readonly messages = Object.freeze({
    INSTRUMENT_NOT_CONFIGURED: 'Hệ thống chưa cấu hình nhạc cụ để phân tích audio.'
  });

  // Mọi mã nhạc cụ của nền tảng (kể cả alias) ứng với một id Rhythm, dùng để tìm dòng Instrument trong DB
  static codesFor(rhythmInstrumentId: string): string[] {
    const aliases = Object.entries(AudioConstant.rhythmInstruments).filter(([, id]) => id === rhythmInstrumentId).map(([code]) => code);
    return [...new Set([...aliases, rhythmInstrumentId])];
  }

  static readonly orphanRetentionMs = 24 * 60 * 60 * 1000;
  static readonly temporaryDirectory = 'bvc-audio-uploads';
  // Cắt theo cao độ khi lưu audio: chỉ giữ từ nốt có cao độ đầu tiên đến nốt cuối cùng, kèm một đoạn đệm
  static readonly pitchTrim = Object.freeze({
    sampleRate: 16_000,
    frameSize: 1024,
    hopSize: 256,
    // Dải tần cơ bản của các nhạc cụ; cận dưới 70 Hz để bỏ qua tiếng ù điện lưới 50/60 Hz
    minHz: 70,
    maxHz: 2000,
    yinThreshold: 0.2,
    // Khung nhỏ hơn mức này coi là im lặng, bỏ qua không dò cao độ
    minLevelDb: -45,
    // Cần ít nhất ngần này khung liên tiếp có cao độ (~50 ms) để tránh nhận nhầm tiếng click
    minPitchedFrames: 3,
    // Mỗi đầu chỉ dò tối đa ngần này giây; không thấy cao độ thì giữ nguyên đầu đó
    maxScanSec: 30,
    paddingStartSec: 0.15,
    paddingEndSec: 0.25,
    // Phần cắt ngắn hơn mức này thì bỏ qua, không mã hóa lại file
    minCutSec: 0.05,
    maxDecodedBytes: 128 * 1024 * 1024
  });
  // Bài tải file lên cắt cả hai đầu; bản ghi âm trực tiếp chỉ cắt phần cuối
  static readonly trimEdgesBySource: Readonly<Record<Audio.UploadSource, Audio.TrimEdges>> = Object.freeze({ file: 'both', recording: 'end' });
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
