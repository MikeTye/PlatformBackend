import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { SavedItemController } from "./savedItemController.js";
import { SavedItemService } from "./savedItemService.js";

export function createSavedItemRoutes(db: Pool) {
    const router = Router();

    const savedItemService = new SavedItemService(db);
    const savedItemController = new SavedItemController(savedItemService);

    router.get("/", requireAuth, savedItemController.listSavedItems);
    router.post("/", requireAuth, savedItemController.saveItem);
    router.delete(
        "/:entityType/:entityId",
        requireAuth,
        savedItemController.removeSavedItem
    );

    return router;
}