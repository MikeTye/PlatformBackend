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
    router.get("/:id", projectController.getProjectDetail);

    return router;
}