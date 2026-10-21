import type { EnsembleSessionRecord, EnsembleTrackRecord } from '../repository/EnsembleRepository.ts';

export interface EnsembleTrackItem {
  id: string;
  instrumentId: string;
  instrumentName: string;
  fileUrl: string;
  durationSec: number;
  offsetMs: number;
  defaultVolume: number;
}

export interface EnsembleSessionItem {
  id: string;
  pieceId: string;
  instrumentId: string;
  assignmentId: string | null;
  recordingUrl: string | null;
  trackSettings: unknown;
  targetBpm: number;
  status: EnsembleSessionRecord['status'];
  createdAt: string;
}

export default class EnsembleDTO {
  static toTrackItem(track: EnsembleTrackRecord): EnsembleTrackItem {
    return {
      id: track.id,
      instrumentId: track.instrumentId,
      instrumentName: track.instrument.name,
      fileUrl: track.fileUrl,
      durationSec: track.durationSec,
      offsetMs: track.offsetMs,
      defaultVolume: track.defaultVolume
    };
  }

  static toSessionItem(session: EnsembleSessionRecord): EnsembleSessionItem {
    return { ...session, createdAt: session.createdAt.toISOString() };
  }
}
