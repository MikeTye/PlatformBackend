import type { ErrorLogService } from "./errorLogService.js";

export function registerProcessErrorHandlers(errorLogService: ErrorLogService) {
    process.on("unhandledRejection", async (reason) => {
        await errorLogService.log({
            source: "backend",
            level: "fatal",
            message: reason instanceof Error ? reason.message : String(reason),
            ...(reason instanceof Error && reason.stack ? { stack: reason.stack } : {}),
            category: "unhandled_rejection",
            context: {},
        });
    });

    process.on("uncaughtException", async (error) => {
        await errorLogService.log({
            source: "backend",
            level: "fatal",
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {}),
            category: "uncaught_exception",
            context: {},
        });

        console.error("Uncaught exception", error);
    });
}