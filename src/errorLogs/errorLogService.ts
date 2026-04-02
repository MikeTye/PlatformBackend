import type { Request } from "express";
import { ErrorLogRepo, type ErrorLogPayload } from "./errorLogRepo.js";

export class ErrorLogService {
  constructor(private readonly repo: ErrorLogRepo) {}

  async log(payload: ErrorLogPayload): Promise<void> {
    try {
      await this.repo.create(payload);
    } catch (err) {
      console.error("Failed to persist error log", err);
    }
  }

  async logBackendError(
    err: unknown,
    req?: Request,
    extra?: Partial<ErrorLogPayload>
  ): Promise<void> {
    const error = err instanceof Error ? err : new Error(String(err));

    const payload: ErrorLogPayload = {
      source: "backend",
      level: "error",
      message: error.message,
      category: extra?.category ?? "server_exception",
      ...(error.stack ? { stack: error.stack } : {}),
      ...(req?.requestId ? { requestId: req.requestId } : {}),
      ...((req as any)?.currentUser?.id
        ? { userId: (req as any).currentUser.id as string }
        : {}),
      ...(req?.originalUrl ? { path: req.originalUrl } : {}),
      ...(req?.method ? { method: req.method } : {}),
      ...(typeof extra?.statusCode === "number"
        ? { statusCode: extra.statusCode }
        : {}),
      ...(extra?.code ? { code: extra.code } : {}),
      ...(extra?.context ? { context: extra.context } : {}),
    };

    await this.log(payload);
  }
}