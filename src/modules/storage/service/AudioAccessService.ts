import AudioAccessRepository from '../repository/AudioAccessRepository.ts';

export type AudioAccess = 'PUBLIC' | 'ALLOWED' | 'LOGIN_REQUIRED' | 'DENIED';

const ROLES = { STUDENT: 1, LECTURER: 2, ADMIN: 3 } as const;

// Who may open a file under /uploads/audio without a signed URL (AD-010, NFR Security)
export default class AudioAccessService {
  static async check(key: string, actor: Backend.UserDTO | null): Promise<AudioAccess> {
    const upload = await AudioAccessRepository.findUpload(key);
    if (upload) {
      if (!actor) return 'LOGIN_REQUIRED';
      const isAllowed = actor.role === ROLES.ADMIN || actor.userId === upload.ownerId || upload.lecturerIds.includes(actor.userId);
      return isAllowed ? 'ALLOWED' : 'DENIED';
    }
    const reference = await AudioAccessRepository.findReference(key);
    if (!reference) return 'DENIED';
    if (reference.isPublic) return 'PUBLIC';
    if (!actor) return 'LOGIN_REQUIRED';
    if (actor.role === ROLES.ADMIN || actor.userId === reference.uploadedById || reference.pieceOwnerIds.includes(actor.userId)) return 'ALLOWED';
    if (actor.role === ROLES.STUDENT && await AudioAccessRepository.isAssignedToStudent(actor.userId, reference.pieceIds)) return 'ALLOWED';
    return 'DENIED';
  }
}
