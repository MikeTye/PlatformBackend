import { Router } from "express";
import type { Pool } from "pg";
import { AccountController } from "./accountController.js";
import { AccountService } from "./accountService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export function buildAccountRouter(db: Pool): Router {
    const router = Router();

    const service = new AccountService(db);
    const controller = new AccountController(service);

    router.get("/", requireAuth, controller.getAccount);
    router.put("/", requireAuth, controller.updateAccount);
    router.delete("/", requireAuth, controller.deleteAccount);

    // authenticated self
    router.get("/companies", requireAuth, controller.getOwnCompanies);
    router.get("/projects", requireAuth, controller.getOwnProjects);

    // public profile
    router.get("/:id/profile", controller.getPublicProfile);
    router.get("/:id/companies", controller.getPublicCompanies);
    router.get("/:id/projects", controller.getPublicProjects);

    return router;
}