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
        "/:companyId/invite-link",
        requireAuth,
        companyController.getOrCreateInviteLink
    );

    router.delete(
        "/:companyId",
        requireAuth,
        companyController.deleteCompany
    );

    router.get("/:companyId/media/upload-url", requireAuth, companyController.getCompanyMediaUploadUrl);
    router.post("/:companyId/media", requireAuth, companyController.createCompanyMedia);
    router.patch("/:companyId/media/:mediaId", requireAuth, companyController.updateCompanyMedia);
    router.delete("/:companyId/media/:mediaId", requireAuth, companyController.deleteCompanyMedia);

    router.get("/:companyId/documents/upload-url", requireAuth, companyController.getCompanyDocumentUploadUrl);
    router.post("/:companyId/documents", requireAuth, companyController.createCompanyDocument);
    router.patch("/:companyId/documents/:documentId", requireAuth, companyController.updateCompanyDocument);
    router.delete("/:companyId/documents/:documentId", requireAuth, companyController.deleteCompanyDocument);

    return router;
}