import { z } from 'zod';

export interface TrackSetting {
  trackId: string;
  volume: number;
  isMuted: boolean;
  isSolo: boolean;
}

const trackSettingsSchema = z.array(
  z.object({ trackId: z.string().min(1), volume: z.number().min(0).max(100), isMuted: z.boolean(), isSolo: z.boolean() })
);

export interface PieceAvailability {
  visibility: 'PUBLIC' | 'HIDDEN';
  moderation: 'NORMAL' | 'ADMIN_HIDDEN';
  deletedAt: Date | null;
}

export default class EnsemblePolicyService {
  // Free practice follows the public library; an assignment may use a piece its lecturer keeps hidden,
  // but never one hidden by an admin or deleted
  static canPracticePiece(input: { piece: PieceAvailability; isViaAssignment: boolean }): boolean {
    if (input.piece.deletedAt || input.piece.moderation === 'ADMIN_HIDDEN') return false;
    return input.isViaAssignment || input.piece.visibility === 'PUBLIC';
  }

  static filterTracks<TTrack extends { instrumentId: string }>(input: { tracks: TTrack[]; studentInstrumentId: string }): TTrack[] {
    return input.tracks.filter((track) => track.instrumentId !== input.studentInstrumentId);
  }

  static resolveTargetBpm(input: { assignmentBpm: number | null; pieceBpm: number }): number {
    return input.assignmentBpm ?? input.pieceBpm;
  }

  static validateUpload(input: { sizeBytes: number; extension: string; maxMb: number; formats: string[] }): { isValid: boolean; message?: string } {
    if (input.sizeBytes <= 0) return { isValid: false, message: 'File bản thu rỗng.' };
    if (input.sizeBytes > input.maxMb * 1024 * 1024) {
      return { isValid: false, message: `Bản thu vượt quá dung lượng tối đa ${input.maxMb} MB.` };
    }
    const extension = input.extension.replace(/^\./, '').toLowerCase();
    if (!input.formats.map((format) => format.toLowerCase()).includes(extension)) {
      return { isValid: false, message: `Định dạng bản thu không được hỗ trợ. Chỉ chấp nhận: ${input.formats.join(', ')}.` };
    }
    return { isValid: true };
  }

  static parseTrackSettings(raw: string): TrackSetting[] | null {
    try {
      const parsed = trackSettingsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
