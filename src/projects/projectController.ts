import type { Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import { CreateProjectSchema, ListProjectsQuerySchema, ProjectDetailParamsSchema } from "./schema.js";
import { ProjectService } from "./projectService.js";

export class ProjectController {
    constructor(private readonly projectService: ProjectService) { }

    createProject = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const input = CreateProjectSchema.parse(req.body);
            const project = await this.projectService.createProject(userId, input);

            return res.status(201).json({
                ok: true,
                data: {
                    id: project.id,
                },
            });
        } catch (err) {
            return next(err);
        }
    };

    listProjects = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const query = ListProjectsQuerySchema.parse(req.query);

            const result = await this.projectService.listProjects({
                userId: req.user?.userId ?? null,
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

    getProjectDetail = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const params = ProjectDetailParamsSchema.parse(req.params);

            const result = await this.projectService.getProjectDetail({
                projectId: params.id,
                userId: req.user?.userId ?? null,
            });

            if (!result) {
                return res.status(404).json({
                    ok: false,
                    error: "Project not found",
                });
            }

            return res.status(200).json(result);
        } catch (err) {
            return next(err);
        }
    };
}