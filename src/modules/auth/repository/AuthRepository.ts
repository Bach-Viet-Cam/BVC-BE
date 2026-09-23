import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuthModel from '../model/AuthModel.ts';

export default class AuthRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findIdentityByProvider(provider: string, providerId: string): Promise<{ user: Backend.UserRecord } | null> {
    return AuthRepository.client.authIdentity.findUnique({
      where: { provider_providerId: { provider, providerId } },
      select: AuthModel.identityWithUserSelect
    });
  }

  static async findUserByEmail(email: string): Promise<Backend.UserRecord | null> {
    return AuthRepository.client.user.findUnique({
      where: { email },
      select: AuthModel.userSelect
    });
  }

  static async findUserById(userId: string): Promise<Backend.UserRecord | null> {
    return AuthRepository.client.user.findUnique({
      where: { id: userId },
      select: AuthModel.userSelect
    });
  }

  static async createUserWithIdentity({ email, username, role, provider, providerId }: { email: string; username: string; role: Backend.UserRole; provider: string; providerId: string }): Promise<Backend.UserRecord> {
    return AuthRepository.client.user.create({
      data: {
        email,
        username,
        role,
        identities: { create: { provider, providerId } }
      },
      select: AuthModel.userSelect
    });
  }

  static async createIdentity({ userId, provider, providerId }: { userId: string; provider: string; providerId: string }): Promise<unknown> {
    return AuthRepository.client.authIdentity.create({
      data: { userId, provider, providerId },
      select: AuthModel.identityWithUserSelect
    });
  }

  static async createSession({ userId, refreshHash, expiresAt }: { userId: string; refreshHash: string; expiresAt: Date }): Promise<unknown> {
    return AuthRepository.client.authSession.create({
      data: { userId, refreshHash, expiresAt },
      select: { id: true, userId: true, refreshHash: true, expiresAt: true }
    });
  }

  static async findActiveSessionByHash(refreshHash: string): Promise<Backend.SessionRecord | null> {
    return AuthRepository.client.authSession.findFirst({
      where: {
        refreshHash,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: { select: AuthModel.userSelect } }
    });
  }

  static async revokeSession(sessionId: string): Promise<unknown> {
    return AuthRepository.client.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() }
    });
  }

  static async rotateSession({ sessionId, refreshHash, expiresAt }: { sessionId: string; refreshHash: string; expiresAt: Date }): Promise<unknown> {
    return AuthRepository.client.authSession.update({
      where: { id: sessionId },
      data: { refreshHash, expiresAt }
    });
  }
}
