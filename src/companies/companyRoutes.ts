import { Router } from "express";
import multer from "multer";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { CompanyController } from "./companyController.js";
import { CompanyService } from "./companyService.js";

export function createCompanyRoutes(db: Pool) {
    const router = Router();

    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 1 * 1024 * 1024 },
    });

    const companyService = new CompanyService(db);
    const companyController = new CompanyController(companyService);

    router.get("/", companyController.listCompanies);
    router.get("/options", companyController.listOptions);
    router.get("/:companyIdOrSlug", companyController.getCompanyDetail);

    router.post(
        "/",
        requireAuth,
        upload.single("logo"),
        companyController.createCompany
    );

    router.patch(
        "/:companyId",
        requireAuth,
        companyController.updateCompanyDetail
    );

    router.get(
        "/companies/:companyId/invite-link",
        requireAuth,
        companyController.getOrCreateInviteLink
    );
    
    return router;
}