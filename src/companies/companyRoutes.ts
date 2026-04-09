import { Router } from "express";
import multer from "multer";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { CompanyController } from "./companyController.js";
import { CompanyService } from "./companyService.js";

import { createCompanyMediaRoutes } from "../companyMedia/companyMediaRoutes.js";
import { createCompanyDocumentRoutes } from "../companyDocument/companyDocumentRoutes.js";

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
        "/:companyId/invite-link",
        requireAuth,
        companyController.getOrCreateInviteLink
    );

    router.delete(
        "/:companyId",
        requireAuth,
        companyController.deleteCompany
    );

    router.use("/:companyId/media", createCompanyMediaRoutes(db));
    router.use("/:companyId/documents", createCompanyDocumentRoutes(db));

    return router;
}