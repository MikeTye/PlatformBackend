import type { Pool } from "pg";

export type ErrorLogPayload = {
    source: "frontend" | "backend";
    level?: "info" | "warn" | "error" | "fatal";
    message: string;
    code?: string;
    category?: string;
    requestId?: string;
    userId?: string | null;
    path?: string;
    method?: string;
    statusCode?: number;
    stack?: string;
    context?: Record<string, unknown>;
};

export class ErrorLogRepo {
    constructor(private readonly pool: Pool) { }

    async create(payload: ErrorLogPayload): Promise<void> {
        await this.pool.query(
            `
        INSERT INTO public.error_logs (
          source,
          level,
          message,
          code,
          category,
          request_id,
          user_id,
          path,
          method,
          status_code,
          stack,
          context
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb
        )
      `,
            [
                payload.source,
                payload.level ?? "error",
                payload.message,
                payload.code ?? null,
                payload.category ?? null,
                payload.requestId ?? null,
                payload.userId ?? null,
                payload.path ?? null,
                payload.method ?? null,
                payload.statusCode ?? null,
                payload.stack ?? null,
                JSON.stringify(payload.context ?? {}),
            ]
        );
    }
}