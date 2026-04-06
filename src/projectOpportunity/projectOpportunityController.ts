import type { Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    ProjectOpportunityParamsSchema,
    ProjectOpportunityItemParamsSchema,
    ListProjectOpportunitiesQuerySchema,
    CreateProjectOpportunityBodySchema,
    UpdateProjectOpportunityBodySchema,
} from "./schema.js";
import { ProjectOpportunityService } from "./projectOpportunityService.js";

export class ProjectOpportunityController {
    constructor(private readonly projectOpportunityService: ProjectOpportunityService) { }

    private getCurrentUserId(req: RequestWithUser): string | null {
        return req.user?.userId ?? null;
    }

    list = async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const currentUserId = this.getCurrentUserId(req);
            if (!currentUserId) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const query = ListProjectOpportunitiesQuerySchema.parse(req.query);

            if (req.params.projectId) {
                const { projectId } = ProjectOpportunityParamsSchema.parse(req.params);
                const result = await this.projectOpportunityService.listByProject(
                    projectId,
                    currentUserId,
                );
                return res.status(200).json(result);
            }

            const result = await this.projectOpportunityService.listRecent(currentUserId, {
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

            const { projectId } = ProjectOpportunityParamsSchema.parse(req.params);
            const body = CreateProjectOpportunityBodySchema.parse(req.body);

            const opportunity = await this.projectOpportunityService.create(
                projectId,
                currentUserId,
                body,
            );

            return res.status(201).json({
                ok: true,
                data: opportunity,
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

            const { opportunityId } = ProjectOpportunityItemParamsSchema.parse(req.params);
            const body = UpdateProjectOpportunityBodySchema.parse(req.body);

            const opportunity = await this.projectOpportunityService.update(
                opportunityId,
                currentUserId,
                body,
            );

            if (!opportunity) {
                return res.status(404).json({ message: "Opportunity not found" });
            }

            return res.status(200).json({
                ok: true,
                data: opportunity,
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

            const { opportunityId } = ProjectOpportunityItemParamsSchema.parse(req.params);

            const deleted = await this.projectOpportunityService.remove(
                opportunityId,
                currentUserId,
            );

            if (!deleted) {
                return res.status(404).json({ message: "Opportunity not found" });
            }

            return res.status(200).json({
                ok: true,
                data: {
                    id: opportunityId,
                    deleted: true,
                },
            });
        } catch (err) {
            return next(err);
        }
    };
}