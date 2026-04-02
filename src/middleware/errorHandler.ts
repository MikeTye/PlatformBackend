import type { NextFunction, Request, Response } from "express";
import type { ErrorLogService } from "../errorLogs/errorLogService.js";

export function createErrorHandler(errorLogService: ErrorLogService) {
    return async function errorHandler(
        err: unknown,
        req: Request,
        res: Response,
        _next: NextFunction
    ) {
        const statusCode =
            typeof (err as any)?.statusCode === "number"
                ? (err as any).statusCode
                : 500;

        await errorLogService.logBackendError(err, req, {
            statusCode,
            category: "express_error_middleware",
        });

        if (res.headersSent) {
            return;
        }

        res.status(statusCode).json({
            ok: false,
            error: statusCode >= 500 ? "Internal server error" : (err as any)?.message ?? "Request failed",
            requestId: req.requestId,
        });
    };
}