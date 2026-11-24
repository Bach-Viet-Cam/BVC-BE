import PrismaClientProvider from '../../../config/PrismaClient.ts';

export interface UploadAccessRecord {
  ownerId: string;
  lecturerIds: string[];
}

export interface ReferenceAccessRecord {
  uploadedById: string;
  isPublic: boolean;
  pieceIds: string[];
  pieceOwnerIds: string[];
}

export default class AudioAccessRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  // A student recording: its owner and the lecturers (owner and co-lecturers) of the classes it was submitted to
  static async findUpload(key: string): Promise<UploadAccessRecord | null> {
    const upload = await AudioAccessRepository.client.audioUpload.findFirst({
      where: { key },
      select: {
        ownerId: true,
        submissions: { select: { assignment: { select: { class: { select: { ownerId: true, coLecturers: { select: { lecturerId: true } } } } } } } }
      }
    });
    if (!upload) return null;
    const lecturerIds = upload.submissions.flatMap((submission) => {
      const classRecord = submission.assignment?.class;
      return classRecord ? [classRecord.ownerId, ...classRecord.coLecturers.map((item) => item.lecturerId)] : [];
    });
    return { ownerId: upload.ownerId, lecturerIds };
  }

  // A reference recording of a sheet: public when one of its sheets and that sheet's piece are public and not hidden
  static async findReference(key: string): Promise<ReferenceAccessRecord | null> {
    const media = await AudioAccessRepository.client.mediaFile.findFirst({
      where: { storageKey: key, kind: 'AUDIO' },
      select: {
        uploadedById: true,
        referenceAudioOf: {
          select: {
            visibility: true,
            moderation: true,
            piece: { select: { id: true, ownerId: true, visibility: true, moderation: true, deletedAt: true } }
          }
        }
      }
    });
    if (!media) return null;
    const sheets = media.referenceAudioOf;
    return {
      uploadedById: media.uploadedById,
      isPublic: sheets.some((sheet) => sheet.visibility === 'PUBLIC' && sheet.moderation === 'NORMAL'
        && sheet.piece.visibility === 'PUBLIC' && sheet.piece.moderation === 'NORMAL' && !sheet.piece.deletedAt),
      pieceIds: sheets.map((sheet) => sheet.piece.id),
      pieceOwnerIds: sheets.map((sheet) => sheet.piece.ownerId)
    };
  }

  // A hidden piece can still be practised through an assignment of the student's class
  static async isAssignedToStudent(studentId: string, pieceIds: string[]): Promise<boolean> {
    if (pieceIds.length === 0) return false;
    const count = await AudioAccessRepository.client.assignment.count({
      where: {
        deletedAt: null,
        status: { in: ['PUBLISHED', 'CLOSED'] },
        sheetMusic: { pieceId: { in: pieceIds } },
        class: { members: { some: { userId: studentId, removedAt: null } } }
      }
    });
    return count > 0;
  }
}
