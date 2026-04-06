import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { ProjectController } from "./projectController.js";
import { ProjectService } from "./projectService.js";
import { createProjectMediaRoutes } from "../projectMedia/projectMediaRoutes.js";
import { createProjectDocumentRoutes } from "../projectDocument/projectDocumentRoutes.js";
import { createProjectOpportunityRoutes } from "../projectOpportunity/projectOpportunityRoutes.js";
import { createProjectUpdateRoutes } from "../projectUpdate/projectUpdateRoutes.js";

export function createProjectRoutes(db: Pool) {
  const router = Router();

  const projectService = new ProjectService(db);
  const projectController = new ProjectController(projectService);

  router.get("/", requireAuth, projectController.listProjects);
  router.post("/", requireAuth, projectController.createProject);

  router.use("/opportunities", createProjectOpportunityRoutes(db));
  router.use("/:projectId/opportunities", createProjectOpportunityRoutes(db));

  router.use("/updates", createProjectUpdateRoutes(db));
  router.use("/:projectId/updates", createProjectUpdateRoutes(db));

  router.get("/:id", projectController.getProjectById);
  router.get("/:id/edit", requireAuth, projectController.getProjectForEdit);

  router.patch("/:id", requireAuth, projectController.updateProject);
  router.patch("/:id/visibility", requireAuth, projectController.updateProjectVisibility);
  router.delete("/:id", requireAuth, projectController.deleteProject);

  router.use("/:projectId/media", createProjectMediaRoutes(db));
  router.use("/:projectId/documents", createProjectDocumentRoutes(db));

  return router;
}