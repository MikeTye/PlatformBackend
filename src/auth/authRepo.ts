import type { AuthIntent } from "./authService.js";

export type InsertEmailCodeInput = {
    emailNormalized: string;
    userId: string | null;
    intent: AuthIntent;
    codeHash: string;
    expiresAt: Date;
    ip?: string | null;
    userAgent?: string | null;
};

export interface AuthUser {
    id: string;
    email: string;
    email_verified: boolean;
    name?: string | undefined | null;
    avatar_url?: string | undefined | null;
}

export type VerifyAndConsumeOtpResult =
    | {
          ok: true;
          userId: string | null;
      }
    | {
          ok: false;
          reason: "invalid" | "expired" | "too_many_attempts";
      };

export interface AuthRepo {
    findUserByEmail(email: string): Promise<AuthUser | null>;
    findUserById(userId: string): Promise<AuthUser | null>;
    createUser(input: {
        email: string;
        emailVerified: boolean;
        name?: string | null;
        avatarUrl?: string | null;
    }): Promise<AuthUser>;
    updateUserProfile(
        userId: string,
        input: { name?: string | undefined| null; avatarUrl?: string | undefined | null }
    ): Promise<void>;
    markEmailVerified(userId: string): Promise<void>;
    updateLastLogin(userId: string): Promise<void>;

    invalidateActiveCodes(emailNormalized: string): Promise<void>;

    insertEmailCode(input: InsertEmailCodeInput): Promise<{ id: string }>;

    verifyAndConsumeOtp(
        emailNormalized: string,
        codeHash: string
    ): Promise<VerifyAndConsumeOtpResult>;

    insertSession(input: {
        userId: string;
        sessionTokenHash: string;
        expiresAt: Date;
        ip?: string | null;
        userAgent?: string | null;
    }): Promise<{ id: string }>;

    findSessionByHash(sessionTokenHash: string): Promise<{
        id: string;
        user_id: string;
        expires_at: string | Date;
        revoked_at: string | Date | null;
    } | null>;

    revokeSession(sessionId: string): Promise<void>;
}