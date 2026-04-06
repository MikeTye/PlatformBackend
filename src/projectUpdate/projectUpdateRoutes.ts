import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { ProjectUpdateService } from "./projectUpdateService.js";
import { ProjectUpdateController } from "./projectUpdateController.js";

export function createProjectUpdateRoutes(db: Pool) {
    const router = Router({ mergeParams: true });

    const service = new ProjectUpdateService(db);
    const controller = new ProjectUpdateController(service);

    router.get("/", requireAuth, controller.list);
    router.post("/", requireAuth, controller.create);
    router.patch("/:updateId", requireAuth, controller.update);
    router.delete("/:updateId", requireAuth, controller.remove);

    return router;
}