import crypto from "node:crypto";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import type { AuthRepo, AuthUser } from "./authRepo.js";
import type { Mailer } from "./mailer.js";

export type AuthIntent = "login" | "signup";

type InviteResolution = {
    inviteLinkId: string;
    companyId: string;
    companySlug?: string | null;
    companyDisplayName?: string | null;
    isActive: boolean;
};

type InviteRedirectInfo = {
    companyId: string;
    companySlug?: string | null;
    redirectTo: string;
};

type RequestCodeInput = {
    email: string;
    intent: AuthIntent;
    companyInviteToken?: string | null | undefined;
    ip?: string | null | undefined;
    userAgent?: string | null | undefined;
    referrer?: string | null | undefined;
};

type VerifyCodeInput = {
    email: string;
    code: string;
    intent: AuthIntent;
    name?: string | null | undefined;
    companyInviteToken?: string | null | undefined;
    ip?: string | null | undefined;
    userAgent?: string | null | undefined;
    referrer?: string | null | undefined;
};

type GoogleSignInInput = {
    credential: string;
    intent: AuthIntent;
    agreedToTerms?: boolean | null | undefined;
    companyInviteToken?: string | null | undefined;
    ip?: string | null | undefined;
    userAgent?: string | null | undefined;
    referrer?: string | null | undefined;
};

type AuthSuccessResult = {
    user: AuthUser;
    sessionToken: string;
    sessionExpiresAt: Date;
    invite?: InviteRedirectInfo | null;
};

type InvitePreviewResult = {
    ok: true;
    company: {
        id: string;
        slug?: string | null;
        displayName?: string | null;
    };
    invite: {
        token: string;
    };
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
        status: "signup_required" | "account_exists" | "invalid_invite";
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

        let invite: InviteResolution | null = null;
        if (input.companyInviteToken?.trim()) {
            invite = await this.resolveInviteOrThrow(input.companyInviteToken);
            await this.logInviteEvent(invite, {
                eventType: "request_code",
                email,
                ip: input.ip,
                userAgent: input.userAgent,
                referrer: input.referrer,
                metadata: { intent: input.intent },
            });
        }

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

        const invite = input.companyInviteToken?.trim()
            ? await this.resolveInviteOrThrow(input.companyInviteToken)
            : null;

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

            const session = await this.createSessionForUser({
                user,
                ip: input.ip,
                userAgent: input.userAgent,
            });

            const inviteInfo = invite
                ? await this.consumeCompanyInviteForUser(invite, {
                    userId: user.id,
                    email,
                    ip: input.ip,
                    userAgent: input.userAgent,
                    referrer: input.referrer,
                    source: "email_verify_login",
                })
                : null;

            return {
                ...session,
                invite: inviteInfo,
            };
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

        const session = await this.createSessionForUser({
            user,
            ip: input.ip,
            userAgent: input.userAgent,
        });

        const inviteInfo = invite
            ? await this.consumeCompanyInviteForUser(invite, {
                userId: user.id,
                email,
                ip: input.ip,
                userAgent: input.userAgent,
                referrer: input.referrer,
                source: "email_verify_signup",
            })
            : null;

        return {
            ...session,
            invite: inviteInfo,
        };
    }

    async signInWithGoogle(input: GoogleSignInInput): Promise<AuthSuccessResult> {
        if (input.intent === "signup" && input.agreedToTerms !== true) {
            throw Object.assign(
                new Error("You must agree to the Terms & Conditions before signing up."),
                {
                    status: 400,
                    code: "TERMS_REQUIRED",
                }
            );
        }

        const googleUser = await this.verifyGoogleCredential(input.credential);

        if (!googleUser.emailVerified) {
            throw Object.assign(new Error("Google email is not verified"), {
                status: 401,
            });
        }

        const invite = input.companyInviteToken?.trim()
            ? await this.resolveInviteOrThrow(input.companyInviteToken)
            : null;

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

        const session = await this.createSessionForUser({
            user,
            ip: input.ip,
            userAgent: input.userAgent,
        });

        const inviteInfo = invite
            ? await this.consumeCompanyInviteForUser(invite, {
                userId: user.id,
                email,
                ip: input.ip,
                userAgent: input.userAgent,
                referrer: input.referrer,
                source:
                    input.intent === "signup"
                        ? "google_signup"
                        : "google_login",
            })
            : null;

        return {
            ...session,
            invite: inviteInfo,
        };
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
            invite: null,
        };
    }

    private async resolveInviteOrThrow(token: string): Promise<InviteResolution> {
        const invite = await this.repo.findActiveCompanyInviteByToken(token.trim());

        if (!invite || !invite.isActive) {
            throw Object.assign(new Error("This company invite link is invalid."), {
                status: 400,
                code: "INVALID_COMPANY_INVITE",
            });
        }

        return invite;
    }

    private async consumeCompanyInviteForUser(
        invite: InviteResolution,
        input: {
            userId: string;
            email: string;
            ip?: string | undefined | null;
            userAgent?: string | undefined | null;
            referrer?: string | undefined | null;
            source: string;
        }
    ): Promise<InviteRedirectInfo> {
        await this.repo.addCompanyUserIfMissing({
            companyId: invite.companyId,
            userId: input.userId,
            permission: "viewer",
            role: null,
        });

        await this.logInviteEvent(invite, {
            eventType: "joined",
            invitedUserId: input.userId,
            email: input.email,
            ip: input.ip,
            userAgent: input.userAgent,
            referrer: input.referrer,
            metadata: {
                source: input.source,
                permission: "viewer",
            },
        });

        return {
            companyId: invite.companyId,
            companySlug: invite.companySlug ?? null,
            redirectTo: invite.companySlug
                ? `/companies/${encodeURIComponent(invite.companySlug)}`
                : `/companies/${encodeURIComponent(invite.companyId)}`,
        };
    }

    private async logInviteEvent(
        invite: InviteResolution,
        input: {
            eventType: string;
            invitedUserId?: string | null;
            email?: string | null;
            ip?: string | undefined | null;
            userAgent?: string | undefined | null;
            referrer?: string | null | undefined;
            metadata?: Record<string, unknown>;
        }
    ): Promise<void> {
        await this.repo.insertCompanyInviteEvent({
            inviteLinkId: invite.inviteLinkId,
            companyId: invite.companyId,
            eventType: input.eventType,
            invitedUserId: input.invitedUserId ?? null,
            email: input.email ?? null,
            sessionKey: null,
            ipAddress: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            referrer: input.referrer ?? null,
            metadata: input.metadata ?? {},
        });
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

    async previewCompanyInvite(token: string): Promise<InvitePreviewResult> {
        const normalizedToken = token.trim();

        if (!normalizedToken) {
            throw Object.assign(new Error("Missing company invite token."), {
                status: 400,
                code: "INVALID_COMPANY_INVITE",
            });
        }

        const invite = await this.repo.previewCompanyInviteByToken(normalizedToken);

        if (!invite || !invite.isActive) {
            throw Object.assign(new Error("This invite link is invalid."), {
                status: 400,
                code: "INVALID_COMPANY_INVITE",
            });
        }

        return {
            ok: true,
            company: {
                id: invite.companyId,
                slug: invite.companySlug ?? null,
                displayName: invite.companyDisplayName ?? null,
            },
            invite: {
                token: invite.token,
            },
        };
    }
}