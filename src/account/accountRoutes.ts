import { Router } from "express";
import type { Pool } from "pg";
import { AccountController } from "./accountController.js";
import { AccountService } from "./accountService.js";

// replace this import with your actual auth/session middleware
import { requireAuth } from "../middleware/requireAuth.js";

export function buildAccountRouter(db: Pool): Router {
    const router = Router();

    const service = new AccountService(db);
    const controller = new AccountController(service);

    router.get("/", requireAuth, controller.getAccount);
    router.put("/", requireAuth, controller.updateAccount);
    router.delete("/", requireAuth, controller.deleteAccount);

    router.get("/:id/profile", controller.getPublicProfile);

    return router;
}