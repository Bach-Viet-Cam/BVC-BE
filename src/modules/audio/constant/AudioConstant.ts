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
  static readonly rhythmInstruments: Readonly<Record<string, string>> = Object.freeze({
    DTR: 'dan_tranh', DAN_TRANH: 'dan_tranh', 'dan-tranh': 'dan_tranh',
    DBA: 'dan_bau', DAN_BAU: 'dan_bau', 'dan-bau': 'dan_bau',
    DNH: 'dan_nhi', DAN_NHI: 'dan_nhi', 'dan-nhi': 'dan_nhi',
    DSA: 'sao_truc', SAO_TRUC: 'sao_truc', 'sao-truc': 'sao_truc',
    DTB: 'dan_ty_ba', TY_BA: 'dan_ty_ba', 'ty-ba': 'dan_ty_ba',
    DNG: 'dan_nguyet', DAN_NGUYET: 'dan_nguyet', 'dan-nguyet': 'dan_nguyet'
  });
  static readonly orphanRetentionMs = 24 * 60 * 60 * 1000;
  static readonly temporaryDirectory = 'bvc-audio-uploads';
}
