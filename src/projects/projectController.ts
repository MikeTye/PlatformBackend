import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    CreateProjectSchema,
    DeleteProjectParamsSchema,
    GetProjectParamsSchema,
    ListProjectsQuerySchema,
    UpdateProjectBodySchema,
    UpdateProjectParamsSchema,
    UpdateProjectVisibilityBodySchema,
    UpdateProjectVisibilityParamsSchema,
} from "./schema.js";
import { ProjectService } from "./projectService.js";

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

    updateProjectVisibility = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const { id } = UpdateProjectVisibilityParamsSchema.parse(req.params);
            const { projectVisibility } = UpdateProjectVisibilityBodySchema.parse(req.body);

            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const project = await this.projectService.updateProjectVisibility(
                id,
                currentUserId,
                projectVisibility
            );

            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }

            return res.status(200).json(project);
        } catch (err) {
            return next(err);
        }
    };

    deleteProject = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const { id } = DeleteProjectParamsSchema.parse(req.params);

            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const deleted = await this.projectService.deleteProject(id, currentUserId);

            if (!deleted) {
                return res.status(404).json({ message: "Project not found" });
            }

            return res.status(200).json({
                ok: true,
                data: {
                    id,
                    deleted: true,
                },
            });
        } catch (err) {
            return next(err);
        }
    };
}