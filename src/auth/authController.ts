import type { Request, Response, NextFunction } from "express";
import {
    RequestCodeSchema,
    VerifyCodeSchema,
    GoogleSignInSchema,
} from "./schema.js";
import type { AuthService } from "./authService.js";
import { hashSessionToken } from "./authService.js";
import {
    SESSION_COOKIE_NAME,
    setSessionCookie,
    clearSessionCookie,
} from "./session.js";

export class AuthController {
    constructor(
        private authService: AuthService,
        private sessionSecret: string
    ) { }

    private authUserResponse(user: {
        id: string;
        email: string;
        name?: string | undefined | null;
        avatar_url?: string | undefined | null;
    }) {
        return {
            id: user.id,
            email: user.email,
            name: user.name ?? null,
            avatarUrl: user.avatar_url ?? null,
        };
    }

    requestCode = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = RequestCodeSchema.parse(req.body);

            const result = await this.authService.requestCode({
                email: body.email,
                intent: body.intent,
                companyInviteToken: body.companyInviteToken,
                ip: req.ip,
                userAgent: req.get("user-agent") ?? null,
                referrer: req.get("referer") ?? null,
            });

            if (!result.ok) {
                if (result.status === "signup_required") {
                    return res.status(404).json({
                        ok: false,
                        code: "SIGNUP_REQUIRED",
                        intent: result.intent,
                        message: result.message,
                    });
                }

                if (result.status === "account_exists") {
                    return res.status(409).json({
                        ok: false,
                        code: "ACCOUNT_EXISTS",
                        intent: result.intent,
                        message: result.message,
                    });
                }

                if (result.status === "invalid_invite") {
                    return res.status(400).json({
                        ok: false,
                        code: "INVALID_COMPANY_INVITE",
                        intent: result.intent,
                        message: result.message,
                    });
                }
            }

            return res.json({
                ok: true,
                code: "CODE_SENT",
                intent: result.intent,
                message: result.message,
            });
        } catch (err) {
            next(err);
        }
    };

    verifyCode = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = VerifyCodeSchema.parse(req.body);

            const result = await this.authService.verifyCode({
                email: body.email,
                code: body.code,
                intent: body.intent,
                name: body.name ?? null,
                companyInviteToken: body.companyInviteToken,
                ip: req.ip,
                userAgent: req.get("user-agent") ?? null,
                referrer: req.get("referer") ?? null,
            });

            setSessionCookie(res, result.sessionToken, result.sessionExpiresAt);

            return res.json({
                ok: true,
                user: this.authUserResponse(result.user),
                redirectTo: result.invite?.redirectTo ?? null,
                companyId: result.invite?.companyId ?? null,
                companySlug: result.invite?.companySlug ?? null,
            });
        } catch (err: any) {
            if (err?.code === "INVALID_COMPANY_INVITE") {
                return res.status(400).json({
                    ok: false,
                    code: "INVALID_COMPANY_INVITE",
                    message: err.message,
                });
            }

            next(err);
        }
    };

    googleSignIn = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = GoogleSignInSchema.parse(req.body);

            const result = await this.authService.signInWithGoogle({
                credential: body.credential,
                intent: body.intent,
                agreedToTerms: body.agreedToTerms,
                companyInviteToken: body.companyInviteToken,
                ip: req.ip,
                userAgent: req.get("user-agent") ?? null,
                referrer: req.get("referer") ?? null,
            });

            setSessionCookie(res, result.sessionToken, result.sessionExpiresAt);

            return res.json({
                ok: true,
                user: this.authUserResponse(result.user),
                redirectTo: result.invite?.redirectTo ?? null,
                companyId: result.invite?.companyId ?? null,
                companySlug: result.invite?.companySlug ?? null,
            });
        } catch (err: any) {
            if (err?.code === "SIGNUP_REQUIRED") {
                return res.status(404).json({
                    ok: false,
                    code: "SIGNUP_REQUIRED",
                    message: err.message,
                });
            }

            if (err?.code === "ACCOUNT_EXISTS") {
                return res.status(409).json({
                    ok: false,
                    code: "ACCOUNT_EXISTS",
                    message: err.message,
                });
            }

            if (err?.code === "INVALID_COMPANY_INVITE") {
                return res.status(400).json({
                    ok: false,
                    code: "INVALID_COMPANY_INVITE",
                    message: err.message,
                });
            }

            if (err?.code === "TERMS_REQUIRED") {
                return res.status(400).json({
                    ok: false,
                    code: "TERMS_REQUIRED",
                    message: err.message,
                });
            }

            next(err);
        }
    };

    me = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
            if (!rawToken) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const sessionTokenHash = hashSessionToken(rawToken, this.sessionSecret);
            const result = await this.authService.getSessionUser(sessionTokenHash);

            if (!result) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            return res.json({
                ok: true,
                user: this.authUserResponse(result.user),
            });
        } catch (err) {
            next(err);
        }
    };

    logout = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const rawToken = req.cookies?.[SESSION_COOKIE_NAME];

            if (rawToken) {
                const sessionTokenHash = hashSessionToken(rawToken, this.sessionSecret);
                await this.authService.logout(sessionTokenHash);
            }

            clearSessionCookie(res);

            return res.json({ ok: true });
        } catch (err) {
            next(err);
        }
    };

    previewCompanyInvite = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token =
                typeof req.query.token === "string" ? req.query.token.trim() : "";

            const result = await this.authService.previewCompanyInvite(token);

            return res.json(result);
        } catch (err: any) {
            if (err?.code === "INVALID_COMPANY_INVITE") {
                return res.status(400).json({
                    ok: false,
                    code: "INVALID_COMPANY_INVITE",
                    message: err.message,
                });
            }

            next(err);
        }
    };
}