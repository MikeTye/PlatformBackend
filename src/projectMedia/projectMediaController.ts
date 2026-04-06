import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    deleteObjectByKey,
    getUploadUrlForProjectMedia,
} from "../lib/s3Media.js";
import {
    CreateProjectMediaBodySchema,
    ProjectMediaParamsSchema,
    ProjectMediaProjectParamsSchema,
    ProjectMediaUploadUrlQuerySchema,
    UpdateProjectMediaBodySchema,
} from "./schema.js";
import { ProjectMediaService } from "./projectMediaService.js";

function getFileExt(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed.includes(".")) return "bin";
    return trimmed.split(".").pop() || "bin";
}

export class ProjectMediaController {
    constructor(private readonly projectMediaService: ProjectMediaService) { }

    private getCurrentUserId(req: RequestWithUser): string | null {
        return req.user?.userId ?? null;
    }

    getUploadUrl = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { projectId } = ProjectMediaProjectParamsSchema.parse(req.params);
            const { fileName, contentType } = ProjectMediaUploadUrlQuerySchema.parse(req.query);

            const upload = await getUploadUrlForProjectMedia(
                projectId,
                getFileExt(fileName),
                contentType
            );

            return res.status(200).json({ ok: true, data: upload });
        } catch (err) {
            return next(err);
        }
    };

    create = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { projectId } = ProjectMediaProjectParamsSchema.parse(req.params);
            const body = CreateProjectMediaBodySchema.parse(req.body);

            const item = await this.projectMediaService.create(projectId, userId, body);

            return res.status(201).json({ ok: true, data: item });
        } catch (err) {
            return next(err);
        }
    };

    update = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { projectId, mediaId } = ProjectMediaParamsSchema.parse(req.params);
            const body = UpdateProjectMediaBodySchema.parse(req.body);

            const item = await this.projectMediaService.update(projectId, mediaId, userId, body);

            return res.status(200).json({ ok: true, data: item });
        } catch (err) {
            return next(err);
        }
    };

    remove = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { projectId, mediaId } = ProjectMediaParamsSchema.parse(req.params);

            const deleted = await this.projectMediaService.remove(projectId, mediaId, userId);

            for (const key of deleted.s3Keys) {
                await deleteObjectByKey(key);
            }

            return res.status(200).json({
                ok: true,
                data: {
                    id: deleted.id,
                    deleted: true,
                },
            });
        } catch (err) {
            return next(err);
        }
    };
}