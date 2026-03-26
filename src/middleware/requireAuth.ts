import type { Response, NextFunction } from "express";
import type { RequestWithUser } from "./attachCurrentUser.js";

export function requireAuth(
    req: RequestWithUser,
    res: Response,
    next: NextFunction
) {
    if (!req.user?.userId) {
        return res.status(401).json({
            ok: false,
            error: "Unauthorized",
        });
    }

    return next();
}