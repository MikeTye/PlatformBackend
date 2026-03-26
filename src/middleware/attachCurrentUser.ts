import type { Request, Response, NextFunction } from "express";
import { SESSION_COOKIE_NAME } from "../auth/session.js";
import { hashSessionToken } from "../auth/authService.js";
import type { AuthService } from "../auth/authService.js";

export type RequestWithUser = Request & {
    user?: {
        userId: string;
        email: string;
        name?: string | null;
    };
};

export function attachCurrentUser(
    authService: AuthService,
    sessionSecret: string
) {
    return async (req: RequestWithUser, _res: Response, next: NextFunction) => {
        try {
            const rawToken = req.cookies?.[SESSION_COOKIE_NAME];

            if (!rawToken || typeof rawToken !== "string") {
                return next();
            }

            const sessionTokenHash = hashSessionToken(rawToken, sessionSecret);
            const result = await authService.getSessionUser(sessionTokenHash);

            if (!result) {
                return next();
            }

            req.user = {
                userId: result.user.id,
                email: result.user.email,
                name: result.user.name ?? null,
            };

            return next();
        } catch {
            return next();
        }
    };
}