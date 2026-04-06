import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { ProjectDocumentController } from "./projectDocumentController.js";
import { ProjectDocumentService } from "./projectDocumentService.js";

export function createProjectDocumentRoutes(db: Pool) {
    const router = Router({ mergeParams: true });

    const service = new ProjectDocumentService(db);
    const controller = new ProjectDocumentController(service);

    router.get("/upload-url", requireAuth, controller.getUploadUrl);
    router.post("/", requireAuth, controller.create);
    router.patch("/:documentId", requireAuth, controller.update);
    router.delete("/:documentId", requireAuth, controller.remove);

    return router;
}