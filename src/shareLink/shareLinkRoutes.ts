import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { ShareLinkService } from "./shareLinkService.js";
import { ShareLinkController } from "./shareLinkController.js";

export function buildShareLinkRouter(db: Pool) {
    const router = Router();
    const service = new ShareLinkService(db);
    const controller = new ShareLinkController(service);

    router.post("/", requireAuth, controller.create);
    router.delete("/:entityType/:entityId", requireAuth, controller.deactivate);

    return router;
}

export function buildShareLinkPublicRouter(db: Pool) {
    const router = Router();
    const service = new ShareLinkService(db);
    const controller = new ShareLinkController(service);

    router.get("/preview", controller.preview);

    return router;
}