// session.ts
import type { Response, CookieOptions } from "express";

export const SESSION_COOKIE_NAME = "session";

export function buildSessionCookieOptions(expires: Date): CookieOptions {
    const isProd = process.env.NODE_ENV === "production";

    return {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        expires,
    };
}

export function buildClearSessionCookieOptions(): CookieOptions {
    const isProd = process.env.NODE_ENV === "production";

    return {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
    };
}

export function setSessionCookie(
    res: Response,
    rawToken: string,
    expires: Date
) {
    res.cookie(SESSION_COOKIE_NAME, rawToken, buildSessionCookieOptions(expires));
}

export function clearSessionCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, buildClearSessionCookieOptions());
}