import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { ProjectController } from "./projectController.js";
import { ProjectService } from "./projectService.js";

export function createProjectRoutes(db: Pool) {
    const router = Router();

    const projectService = new ProjectService(db);
    const projectController = new ProjectController(projectService);

    router.get("/", requireAuth, projectController.listProjects);
    router.post("/", requireAuth, projectController.createProject);

    router.get("/opportunities", requireAuth, projectController.listProjectOpportunities);
    router.get("/updates", requireAuth, projectController.listProjectUpdates);
    router.post("/:id/updates", requireAuth, projectController.createProjectUpdate);

    router.get("/:id", projectController.getProjectById);
    router.get("/:id/edit", projectController.getProjectForEdit);

    router.patch('/:id', requireAuth, projectController.updateProject);

    router.get("/:id/media/upload-url", requireAuth, projectController.getProjectMediaUploadUrl);
    router.get("/:id/documents/upload-url", requireAuth, projectController.getProjectDocumentUploadUrl);

    router.post("/:id/media", requireAuth, projectController.createProjectMedia);
    router.patch("/:id/media/:mediaId", requireAuth, projectController.updateProjectMedia);
    router.delete("/:id/media/:mediaId", requireAuth, projectController.deleteProjectMedia);

    router.post("/:id/documents", requireAuth, projectController.createProjectDocument);
    router.patch("/:id/documents/:documentId", requireAuth, projectController.updateProjectDocument);
    router.delete("/:id/documents/:documentId", requireAuth, projectController.deleteProjectDocument);

    return router;
}