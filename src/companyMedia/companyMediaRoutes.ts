import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { CompanyMediaController } from "./companyMediaController.js";
import { CompanyMediaService } from "./companyMediaService.js";

export function createCompanyMediaRoutes(db: Pool) {
    const router = Router({ mergeParams: true });

    const companyMediaService = new CompanyMediaService(db);
    const companyMediaController = new CompanyMediaController(companyMediaService);

    router.get("/", companyMediaController.listCompanyMedia);
    router.get("/upload-url", requireAuth, companyMediaController.getCompanyMediaUploadUrl);
    router.post("/", requireAuth, companyMediaController.createCompanyMedia);
    router.patch("/:mediaId", requireAuth, companyMediaController.updateCompanyMedia);
    router.delete("/:mediaId", requireAuth, companyMediaController.deleteCompanyMedia);

    return router;
}