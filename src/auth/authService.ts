import crypto from "node:crypto";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import type { AuthRepo, AuthUser } from "./authRepo.js";
import type { Mailer } from "./mailer.js";

export type AuthIntent = "login" | "signup";

type RequestCodeInput = {
    email: string;
    intent: AuthIntent;
    ip?: string | undefined | null;
    userAgent?: string | null;
};

type VerifyCodeInput = {
    email: string;
    code: string;
    intent: AuthIntent;
    name?: string | null;
    ip?: string | undefined | null;
    userAgent?: string | null;
};

type GoogleSignInInput = {
    credential: string;
    intent: AuthIntent;
    ip?: string | undefined | null;
    userAgent?: string | undefined | null;
};

type AuthSuccessResult = {
    user: AuthUser;
    sessionToken: string;
    sessionExpiresAt: Date;
};

type RequestCodeResult =
    | {
        ok: true;
        status: "code_sent";
        intent: AuthIntent;
        message: string;
    }
    | {
        ok: false;
        status: "signup_required" | "account_exists";
        intent: AuthIntent;
        message: string;
    };

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function generateOtpCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtpCode(email: string, code: string, secret: string): string {
    return crypto
        .createHmac("sha256", secret)
        .update(`${normalizeEmail(email)}::${code}`)
        .digest("hex");
}

function generateSessionToken(): string {
    return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

type VerifiedGoogleUser = {
    googleSub: string;
    email: string;
    emailVerified: boolean;
    name?: string | undefined;
    picture?: string | undefined;
    hostedDomain?: string | undefined;
};

export class AuthService {
    private googleClient?: OAuth2Client;

    constructor(
        private repo: AuthRepo,
        private mailer: Mailer,
        private otpSecret: string,
        private sessionSecret: string,
        private googleClientId?: string
    ) {
        if (googleClientId) {
            this.googleClient = new OAuth2Client(googleClientId);
        }
    }

    async requestCode(input: RequestCodeInput): Promise<RequestCodeResult> {
        const email = normalizeEmail(input.email);
        const user = await this.repo.findUserByEmail(email);

        if (input.intent === "login" && !user) {
            return {
                ok: false,
                status: "signup_required",
                intent: "login",
                message: "No account found for this email.",
            };
        }

        if (input.intent === "signup" && user) {
            return {
                ok: false,
                status: "account_exists",
                intent: "signup",
                message: "An account already exists for this email.",
            };
        }

        await this.repo.invalidateActiveCodes(email);

        const code = generateOtpCode();
        const codeHash = hashOtpCode(email, code, this.otpSecret);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await this.repo.insertEmailCode({
            emailNormalized: email,
            userId: user?.id ?? null,
            intent: input.intent,
            codeHash,
            expiresAt,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
        });

        await this.mailer.sendOtpEmail({
            to: email,
            code,
            expiresInMinutes: 10,
        });

        return {
            ok: true,
            status: "code_sent",
            intent: input.intent,
            message: "Verification code sent.",
        };
    }

    async verifyCode(input: VerifyCodeInput): Promise<AuthSuccessResult> {
        const email = normalizeEmail(input.email);
        const expectedHash = hashOtpCode(email, input.code, this.otpSecret);

        const otpResult = await this.repo.verifyAndConsumeOtp(email, expectedHash);

        if (!otpResult.ok) {
            if (otpResult.reason === "too_many_attempts") {
                throw Object.assign(new Error("Too many attempts"), { status: 429 });
            }

            throw Object.assign(new Error("Invalid or expired code"), { status: 401 });
        }

        let user = await this.repo.findUserByEmail(email);

        if (input.intent === "login") {
            if (!user) {
                throw Object.assign(new Error("No account found for this email"), {
                    status: 404,
                    code: "SIGNUP_REQUIRED",
                });
            }

            if (!user.email_verified) {
                await this.repo.markEmailVerified(user.id);
                user = { ...user, email_verified: true };
            }

            return this.createSessionForUser({
                user,
                ip: input.ip,
                userAgent: input.userAgent,
            });
        }

        if (user) {
            throw Object.assign(new Error("An account already exists for this email"), {
                status: 409,
                code: "ACCOUNT_EXISTS",
            });
        }

        user = await this.repo.createUser({
            email,
            emailVerified: true,
            name: input.name?.trim() ? input.name.trim() : null,
            avatarUrl: null,
        });

        return this.createSessionForUser({
            user,
            ip: input.ip,
            userAgent: input.userAgent,
        });
    }

    async signInWithGoogle(input: GoogleSignInInput): Promise<AuthSuccessResult> {
        const googleUser = await this.verifyGoogleCredential(input.credential);

        if (!googleUser.emailVerified) {
            throw Object.assign(new Error("Google email is not verified"), {
                status: 401,
            });
        }

        const email = normalizeEmail(googleUser.email);
        let user = await this.repo.findUserByEmail(email);

        if (input.intent === "login") {
            if (!user) {
                throw Object.assign(new Error("No account found for this email"), {
                    status: 404,
                    code: "SIGNUP_REQUIRED",
                });
            }
        } else {
            if (user) {
                throw Object.assign(new Error("An account already exists for this email"), {
                    status: 409,
                    code: "ACCOUNT_EXISTS",
                });
            }

            user = await this.repo.createUser({
                email,
                emailVerified: true,
                name: googleUser.name ?? null,
                avatarUrl: googleUser.picture ?? null,
            });
        }

        if (!user) {
            throw Object.assign(new Error("Unable to resolve user"), { status: 500 });
        }

        if (!user.email_verified) {
            await this.repo.markEmailVerified(user.id);
            user = { ...user, email_verified: true };
        }

        const shouldUpdateName =
            typeof googleUser.name === "string" &&
            googleUser.name.trim().length > 0 &&
            googleUser.name !== user.name;

        const shouldUpdateAvatar =
            typeof googleUser.picture === "string" &&
            googleUser.picture.trim().length > 0 &&
            googleUser.picture !== user.avatar_url;

        if (shouldUpdateName || shouldUpdateAvatar) {
            await this.repo.updateUserProfile(user.id, {
                name: shouldUpdateName ? googleUser.name ?? null : undefined,
                avatarUrl: shouldUpdateAvatar ? googleUser.picture ?? null : undefined,
            });

            user = {
                ...user,
                name: shouldUpdateName ? googleUser.name ?? null : user.name,
                avatar_url: shouldUpdateAvatar
                    ? googleUser.picture ?? null
                    : user.avatar_url,
            };
        }

        return this.createSessionForUser({
            user,
            ip: input.ip,
            userAgent: input.userAgent,
        });
    }

    async getSessionUser(sessionTokenHash: string) {
        const session = await this.repo.findSessionByHash(sessionTokenHash);
        if (!session) return null;
        if (session.revoked_at) return null;
        if (new Date(session.expires_at).getTime() < Date.now()) return null;

        const user = await this.repo.findUserById(session.user_id);
        if (!user) return null;

        return { user };
    }

    async logout(sessionTokenHash: string): Promise<void> {
        const session = await this.repo.findSessionByHash(sessionTokenHash);
        if (!session) return;
        await this.repo.revokeSession(session.id);
    }

    private async createSessionForUser(input: {
        user: AuthUser;
        ip?: string | undefined | null;
        userAgent?: string | undefined | null;
    }): Promise<AuthSuccessResult> {
        await this.repo.updateLastLogin(input.user.id);

        const rawSessionToken = generateSessionToken();
        const sessionTokenHash = hashSessionToken(rawSessionToken, this.sessionSecret);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await this.repo.insertSession({
            userId: input.user.id,
            sessionTokenHash,
            expiresAt,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
        });

        return {
            user: input.user,
            sessionToken: rawSessionToken,
            sessionExpiresAt: expiresAt,
        };
    }

    private async verifyGoogleCredential(
        credential: string
    ): Promise<VerifiedGoogleUser> {
        if (!this.googleClient || !this.googleClientId) {
            throw Object.assign(new Error("Google sign-in is not configured"), {
                status: 500,
            });
        }

        const ticket = await this.googleClient.verifyIdToken({
            idToken: credential,
            audience: this.googleClientId,
        });

        const payload: TokenPayload | undefined = ticket.getPayload();

        if (!payload?.sub) {
            throw Object.assign(new Error("Missing Google sub"), { status: 401 });
        }

        if (!payload.email) {
            throw Object.assign(new Error("Missing Google email"), { status: 401 });
        }

        return {
            googleSub: payload.sub,
            email: payload.email,
            emailVerified: payload.email_verified ?? false,
            name: payload.name,
            picture: payload.picture,
            hostedDomain: payload.hd,
        };
    }
}