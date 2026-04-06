import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { ProjectOpportunityService } from "./projectOpportunityService.js";
import { ProjectOpportunityController } from "./projectOpportunityController.js";

export function createProjectOpportunityRoutes(db: Pool) {
    const router = Router({ mergeParams: true });

    const service = new ProjectOpportunityService(db);
    const controller = new ProjectOpportunityController(service);

    router.get("/", requireAuth, controller.list);
    router.post("/", requireAuth, controller.create);
    router.patch("/:opportunityId", requireAuth, controller.update);
    router.delete("/:opportunityId", requireAuth, controller.remove);

    return router;
}