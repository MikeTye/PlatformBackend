import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { ProjectMediaController } from "./projectMediaController.js";
import { ProjectMediaService } from "./projectMediaService.js";

export function createProjectMediaRoutes(db: Pool) {
    const router = Router({ mergeParams: true });

    const service = new ProjectMediaService(db);
    const controller = new ProjectMediaController(service);

    router.get("/upload-url", requireAuth, controller.getUploadUrl);
    router.post("/", requireAuth, controller.create);
    router.patch("/:mediaId", requireAuth, controller.update);
    router.delete("/:mediaId", requireAuth, controller.remove);

    return router;
}