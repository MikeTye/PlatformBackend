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
                ip: req.ip,
                userAgent: req.get("user-agent") ?? null,
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
                ip: req.ip,
                userAgent: req.get("user-agent") ?? null,
            });

            setSessionCookie(res, result.sessionToken, result.sessionExpiresAt);

            return res.json({
                ok: true,
                user: this.authUserResponse(result.user),
            });
        } catch (err) {
            next(err);
        }
    };

    googleSignIn = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = GoogleSignInSchema.parse(req.body);

            const result = await this.authService.signInWithGoogle({
                credential: body.credential,
                intent: body.intent,
                ip: req.ip,
                userAgent: req.get("user-agent") ?? null,
            });

            setSessionCookie(res, result.sessionToken, result.sessionExpiresAt);

            return res.json({
                ok: true,
                user: this.authUserResponse(result.user),
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
}