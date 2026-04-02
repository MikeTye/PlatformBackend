import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
    namespace Express {
        interface Request {
            requestId?: string;
        }
    }
}

export function attachRequestId(req: Request, res: Response, next: NextFunction) {
    const requestId = req.header("x-request-id") || randomUUID();

    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    next();
}