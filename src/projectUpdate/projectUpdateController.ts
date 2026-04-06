import type { Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    ProjectUpdateParamsSchema,
    ProjectUpdateItemParamsSchema,
    ListProjectUpdatesQuerySchema,
    CreateProjectUpdateBodySchema,
    UpdateProjectUpdateBodySchema,
} from "./schema.js";
import { ProjectUpdateService } from "./projectUpdateService.js";

export class ProjectUpdateController {
    constructor(private readonly projectUpdateService: ProjectUpdateService) { }

    private getCurrentUserId(req: RequestWithUser): string | null {
        return req.user?.userId ?? null;
    }

    list = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const query = ListProjectUpdatesQuerySchema.parse(req.query);

            if (req.params.projectId) {
                const { projectId } = ProjectUpdateParamsSchema.parse(req.params);
                const result = await this.projectUpdateService.listByProject(
                    projectId,
                    currentUserId,
                );
                return res.status(200).json(result);
            }

            const result = await this.projectUpdateService.listRecent(currentUserId, {
                limit: query.limit,
            });

            return res.status(200).json(result);
        } catch (err) {
            return next(err);
        }
    };

    create = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const { projectId } = ProjectUpdateParamsSchema.parse(req.params);
            const body = CreateProjectUpdateBodySchema.parse(req.body);

            const update = await this.projectUpdateService.create(
                projectId,
                currentUserId,
                body,
            );

            return res.status(201).json({
                ok: true,
                data: update,
            });
        } catch (err) {
            return next(err);
        }
    };

    update = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const { updateId } = ProjectUpdateItemParamsSchema.parse(req.params);
            const body = UpdateProjectUpdateBodySchema.parse(req.body);

            const update = await this.projectUpdateService.update(
                updateId,
                currentUserId,
                body,
            );

            if (!update) {
                return res.status(404).json({ message: "Update not found" });
            }

            return res.status(200).json({
                ok: true,
                data: update,
            });
        } catch (err) {
            return next(err);
        }
    };

    remove = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const { updateId } = ProjectUpdateItemParamsSchema.parse(req.params);

            const deleted = await this.projectUpdateService.remove(updateId, currentUserId);

            if (!deleted) {
                return res.status(404).json({ message: "Update not found" });
            }

            return res.status(200).json({
                ok: true,
                data: {
                    id: updateId,
                    deleted: true,
                },
            });
        } catch (err) {
            return next(err);
        }
    };
}