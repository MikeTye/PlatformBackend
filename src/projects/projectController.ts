import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    CreateProjectSchema,
    CreateProjectUpdateBodySchema,
    CreateProjectUpdateParamsSchema,
    GetProjectParamsSchema,
    ListProjectOpportunitiesQuerySchema,
    ListProjectsQuerySchema,
    ListProjectUpdatesQuerySchema,
    UpdateProjectBodySchema,
    UpdateProjectParamsSchema,
} from "./schema.js";
import { ProjectService } from "./projectService.js";
import {
    getUploadUrlForProjectMedia,
    getUploadUrlForProjectDocument,
    deleteObjectByKey,
} from "../lib/s3Media.js";
import { z } from "zod";

const ProjectAssetParamsSchema = z.object({
    id: z.string().uuid(),
});

function getFileExt(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed.includes(".")) return "bin";
    return trimmed.split(".").pop() || "bin";
}

export class ProjectController {
    constructor(private readonly projectService: ProjectService) { }

    private getCurrentUserId(req: RequestWithUser): string | null {
        return req.user?.userId ?? null;
    }

    createProject = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const input = CreateProjectSchema.parse(req.body);
            const project = await this.projectService.createProject(userId, input);

            return res.status(201).json({
                ok: true,
                data: { id: project.id },
            });
        } catch (err) {
            return next(err);
        }
    };

    listProjects = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const query = ListProjectsQuerySchema.parse(req.query);

            const result = await this.projectService.listProjects({
                userId: this.getCurrentUserId(req),
                scope: query.scope,
                q: query.q,
                stage: query.stage,
                projectType: query.projectType,
                hostCountry: query.hostCountry,
                opportunity: query.opportunity,
                page: query.page,
                pageSize: query.pageSize,
                sortBy: query.sortBy,
                sortDir: query.sortDir,
            });

            return res.status(200).json(result);
        } catch (err) {
            return next(err);
        }
    };

    getProjectById = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const { id } = GetProjectParamsSchema.parse(req.params);

            const project = await this.projectService.getProjectById(
                id,
                this.getCurrentUserId(req),
            );

            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }

            return res.status(200).json(project);
        } catch (err) {
            return next(err);
        }
    };

    getProjectForEdit = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const { id } = GetProjectParamsSchema.parse(req.params);

            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const project = await this.projectService.getProjectForEdit(id, currentUserId);

            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }

            return res.status(200).json(project);
        } catch (err) {
            return next(err);
        }
    };

    updateProject = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const { id } = UpdateProjectParamsSchema.parse(req.params);
            const body = UpdateProjectBodySchema.parse(req.body);

            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const project = await this.projectService.updateProject(id, currentUserId, body);

            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }

            return res.status(200).json(project);
        } catch (err) {
            return next(err);
        }
    };

    createProjectUpdate = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const { id } = CreateProjectUpdateParamsSchema.parse(req.params);
            const body = CreateProjectUpdateBodySchema.parse(req.body);

            const update = await this.projectService.createProjectUpdate(
                id,
                currentUserId,
                body
            );

            if (!update) {
                return res.status(404).json({ message: "Project not found" });
            }

            return res.status(201).json({
                ok: true,
                data: update,
            });
        } catch (err) {
            return next(err);
        }
    };

    getProjectMediaUploadUrl = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);
            const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "";
            const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "";

            if (!fileName.trim() || !contentType.trim()) {
                return res.status(400).json({
                    ok: false,
                    error: "fileName and contentType are required",
                });
            }

            const upload = await getUploadUrlForProjectMedia(
                id,
                getFileExt(fileName),
                contentType
            );

            return res.status(200).json({ ok: true, data: upload });
        } catch (err) {
            return next(err);
        }
    };

    getProjectDocumentUploadUrl = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);
            const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "";
            const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "";

            if (!fileName.trim() || !contentType.trim()) {
                return res.status(400).json({
                    ok: false,
                    error: "fileName and contentType are required",
                });
            }

            const upload = await getUploadUrlForProjectDocument(
                id,
                getFileExt(fileName),
                contentType
            );

            return res.status(200).json({ ok: true, data: upload });
        } catch (err) {
            return next(err);
        }
    };

    createProjectMedia = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);

            const project = await this.projectService.createProjectMedia(id, userId, {
                kind: typeof req.body.kind === "string" ? req.body.kind : "gallery",
                assetUrl: String(req.body.assetUrl ?? "").trim(),
                contentType: typeof req.body.contentType === "string" ? req.body.contentType : null,
                s3Key: typeof req.body.s3Key === "string" ? req.body.s3Key : null,
                sha256: typeof req.body.sha256 === "string" ? req.body.sha256 : null,
                caption: typeof req.body.caption === "string" ? req.body.caption : null,
                isCover: Boolean(req.body.isCover),
                metadata:
                    typeof req.body.metadata === "object" && req.body.metadata !== null
                        ? req.body.metadata
                        : {},
            });

            return res.status(200).json({ ok: true, data: project });
        } catch (err) {
            return next(err);
        }
    };

    updateProjectMedia = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);
            const mediaId = String(req.params.mediaId);

            const project = await this.projectService.updateProjectMedia(id, mediaId, userId, {
                caption: typeof req.body.caption === "string" ? req.body.caption : undefined,
                isCover: typeof req.body.isCover === "boolean" ? req.body.isCover : undefined,
            });

            return res.status(200).json({ ok: true, data: project });
        } catch (err) {
            return next(err);
        }
    };

    deleteProjectMedia = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);
            const mediaId = String(req.params.mediaId);

            const result = await this.projectService.deleteProjectMedia(id, mediaId, userId);

            if (result.s3Key) {
                await deleteObjectByKey(result.s3Key);
            }

            return res.status(200).json({ ok: true, data: result.project });
        } catch (err) {
            return next(err);
        }
    };

    createProjectDocument = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);

            const project = await this.projectService.createProjectDocument(id, userId, {
                kind: typeof req.body.kind === "string" ? req.body.kind : "general",
                assetUrl: String(req.body.assetUrl ?? "").trim(),
                contentType: typeof req.body.contentType === "string" ? req.body.contentType : null,
                s3Key: typeof req.body.s3Key === "string" ? req.body.s3Key : null,
                sha256: typeof req.body.sha256 === "string" ? req.body.sha256 : null,
                name: typeof req.body.name === "string" ? req.body.name : null,
                type: typeof req.body.type === "string" ? req.body.type : null,
                metadata:
                    typeof req.body.metadata === "object" && req.body.metadata !== null
                        ? req.body.metadata
                        : {},
            });

            return res.status(200).json({ ok: true, data: project });
        } catch (err) {
            return next(err);
        }
    };

    updateProjectDocument = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);
            const documentId = String(req.params.documentId);

            const project = await this.projectService.updateProjectDocument(id, documentId, userId, {
                name: typeof req.body.name === "string" ? req.body.name : undefined,
                type: typeof req.body.type === "string" ? req.body.type : undefined,
            });

            return res.status(200).json({ ok: true, data: project });
        } catch (err) {
            return next(err);
        }
    };

    deleteProjectDocument = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = this.getCurrentUserId(req);
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { id } = ProjectAssetParamsSchema.parse(req.params);
            const documentId = String(req.params.documentId);

            const result = await this.projectService.deleteProjectDocument(id, documentId, userId);

            if (result.s3Key) {
                await deleteObjectByKey(result.s3Key);
            }

            return res.status(200).json({ ok: true, data: result.project });
        } catch (err) {
            return next(err);
        }
    };

    listProjectUpdates = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const query = ListProjectUpdatesQuerySchema.parse(req.query);

            const result = await this.projectService.listProjectUpdates(
                this.getCurrentUserId(req),
                {
                    limit: query.limit,
                }
            );

            return res.status(200).json(result);
        } catch (err) {
            return next(err);
        }
    };

    listProjectOpportunities = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const query = ListProjectOpportunitiesQuerySchema.parse(req.query);

            const result = await this.projectService.listProjectOpportunities(
                this.getCurrentUserId(req),
                { limit: query.limit }
            );

            return res.status(200).json(result);
        } catch (err) {
            return next(err);
        }
    };
}