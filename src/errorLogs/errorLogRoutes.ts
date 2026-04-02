import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { ErrorLogRepo, type ErrorLogPayload } from "./errorLogRepo.js";
import { ErrorLogService } from "./errorLogService.js";

const bodySchema = z.object({
    source: z.literal("frontend"),
    level: z.enum(["info", "warn", "error", "fatal"]).optional(),
    message: z.string().min(1).max(5000),
    code: z.string().max(255).optional(),
    category: z.string().max(255).optional(),
    requestId: z.string().max(255).optional(),
    userId: z.string().uuid().nullable().optional(),
    path: z.string().max(2000).optional(),
    method: z.string().max(20).optional(),
    statusCode: z.number().int().optional(),
    stack: z.string().max(20000).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
});

export function createErrorLogRoutes(pool: Pool) {
    const router = Router();
    const service = new ErrorLogService(new ErrorLogRepo(pool));

    router.post("/", async (req, res) => {
        const parsed = bodySchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                error: "Invalid error log payload",
            });
        }

        const data = parsed.data;

        const payload: ErrorLogPayload = {
            source: "frontend",
            message: data.message,
            ...(data.level ? { level: data.level } : {}),
            ...(data.code ? { code: data.code } : {}),
            ...(data.category ? { category: data.category } : {}),
            ...(data.requestId ? { requestId: data.requestId } : {}),
            ...(data.userId !== undefined ? { userId: data.userId } : {}),
            ...(data.path ? { path: data.path } : {}),
            ...(data.method ? { method: data.method } : {}),
            ...(typeof data.statusCode === "number"
                ? { statusCode: data.statusCode }
                : {}),
            ...(data.stack ? { stack: data.stack } : {}),
            ...(data.context ? { context: data.context } : {}),
        };

        await service.log(payload);

        return res.status(201).json({ ok: true });
    });

    return router;
}