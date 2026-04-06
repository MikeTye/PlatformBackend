import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    deleteObjectByKey,
    getUploadUrlForProjectDocument,
} from "../lib/s3Media.js";
import {
    CreateProjectDocumentBodySchema,
    ProjectDocumentParamsSchema,
    ProjectDocumentProjectParamsSchema,
    ProjectDocumentUploadUrlQuerySchema,
    UpdateProjectDocumentBodySchema,
} from "./schema.js";
import { ProjectDocumentService } from "./projectDocumentService.js";

function getFileExt(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed.includes(".")) return "bin";
    return trimmed.split(".").pop() || "bin";
}

export class ProjectDocumentController {
    constructor(private readonly projectDocumentService: ProjectDocumentService) { }

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

            const { projectId } = ProjectDocumentProjectParamsSchema.parse(req.params);
            const { fileName, contentType } = ProjectDocumentUploadUrlQuerySchema.parse(req.query);

            await this.projectDocumentService.assertCanUpload(projectId, userId);

            const upload = await getUploadUrlForProjectDocument(
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

            const { projectId } = ProjectDocumentProjectParamsSchema.parse(req.params);
            const body = CreateProjectDocumentBodySchema.parse(req.body);

            const item = await this.projectDocumentService.create(projectId, userId, body);

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

            const { projectId, documentId } = ProjectDocumentParamsSchema.parse(req.params);
            const body = UpdateProjectDocumentBodySchema.parse(req.body);

            const item = await this.projectDocumentService.update(projectId, documentId, userId, body);

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

            const { projectId, documentId } = ProjectDocumentParamsSchema.parse(req.params);

            const deleted = await this.projectDocumentService.remove(projectId, documentId, userId);

            if (deleted.s3_key) {
                await deleteObjectByKey(deleted.s3_key);
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