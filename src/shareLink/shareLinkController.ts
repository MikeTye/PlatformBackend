import type { NextFunction, Request, Response } from "express";
import type { ShareLinkService } from "./shareLinkService.js";
import {
    CreateShareLinkSchema,
    ShareLinkPreviewQuerySchema,
} from "./schema.js";

type AuthenticatedRequest = Request & {
    currentUser?: {
        id?: string;
    };
    session?: {
        id?: string;
    };
};

function getAuthenticatedUserId(req: AuthenticatedRequest): string | null {
    return req.currentUser?.id ?? null;
}

function getSessionKey(req: AuthenticatedRequest): string | null {
    return typeof req.session?.id === "string" ? req.session.id : null;
}

function getIpAddress(req: Request): string | null {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0]?.trim() ?? null;
    }
    return req.ip ?? null;
}

export class ShareLinkController {
    constructor(private readonly shareLinkService: ShareLinkService) { }

    create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const input = CreateShareLinkSchema.parse(req.body);
            const result = await this.shareLinkService.getOrCreateShareLink(userId, input);

            return res.status(200).json({
                ok: true,
                share: result,
            });
        } catch (error) {
            if (error instanceof Error && error.message === "Forbidden") {
                return res.status(403).json({ message: "Forbidden" });
            }

            if (error instanceof Error && error.message.includes("not found")) {
                return res.status(404).json({ message: error.message });
            }

            if (error instanceof Error) {
                return res.status(400).json({ message: error.message });
            }

            return next(error);
        }
    };

    preview = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const { token } = ShareLinkPreviewQuerySchema.parse(req.query);

            const result = await this.shareLinkService.previewShareLink(token);

            await this.shareLinkService.recordOpen(token, {
                userId: getAuthenticatedUserId(req),
                sessionKey: getSessionKey(req),
                ipAddress: getIpAddress(req),
                userAgent: req.get("user-agent") ?? null,
                referrer: req.get("referer") ?? null,
                eventType: "link_opened",
            });

            return res.status(200).json(result);
        } catch (error) {
            if (error instanceof Error) {
                return res.status(400).json({ message: error.message });
            }
            return next(error);
        }
    };

    deactivate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const entityType = String(req.params.entityType);
            const entityId = String(req.params.entityId);

            const ok = await this.shareLinkService.deactivateShareLink(
                entityType as "company" | "project",
                entityId,
                userId
            );

            return res.status(200).json({ ok });
        } catch (error) {
            if (error instanceof Error && error.message === "Forbidden") {
                return res.status(403).json({ message: "Forbidden" });
            }

            if (error instanceof Error && error.message.includes("not found")) {
                return res.status(404).json({ message: error.message });
            }

            if (error instanceof Error) {
                return res.status(400).json({ message: error.message });
            }

            return next(error);
        }
    };
}