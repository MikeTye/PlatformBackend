import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth.js";
import { CompanyDocumentController } from "./companyDocumentController.js";
import { CompanyDocumentService } from "./companyDocumentService.js";

export function createCompanyDocumentRoutes(db: Pool) {
    const router = Router({ mergeParams: true });

    const companyDocumentService = new CompanyDocumentService(db);
    const companyDocumentController = new CompanyDocumentController(companyDocumentService);

    router.get("/", companyDocumentController.listCompanyDocuments);
    router.get("/upload-url", requireAuth, companyDocumentController.getCompanyDocumentUploadUrl);
    router.post("/", requireAuth, companyDocumentController.createCompanyDocument);
    router.patch("/:documentId", requireAuth, companyDocumentController.updateCompanyDocument);
    router.delete("/:documentId", requireAuth, companyDocumentController.deleteCompanyDocument);

    return router;
}