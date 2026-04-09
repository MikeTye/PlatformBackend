import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    getUploadUrlForCompanyDocument,
    deleteObjectByKey,
} from "../lib/s3Media.js";
import { CompanyDocumentService } from "./companyDocumentService.js";
import {
    CompanyDocumentParamsSchema,
    CompanyDocumentItemParamsSchema,
    CompanyDocumentUploadUrlQuerySchema,
    CreateCompanyDocumentSchema,
    UpdateCompanyDocumentSchema,
} from "./schema.js";

function getFileExt(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed.includes(".")) return "bin";
    return trimmed.split(".").pop() || "bin";
}

export class CompanyDocumentController {
    constructor(private readonly companyDocumentService: CompanyDocumentService) { }

    getCompanyDocumentUploadUrl = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId } = CompanyDocumentParamsSchema.parse(req.params);
            const { fileName, contentType } = CompanyDocumentUploadUrlQuerySchema.parse(req.query);

            const upload = await getUploadUrlForCompanyDocument(
                companyId,
                getFileExt(fileName),
                contentType
            );

            return res.status(200).json({ ok: true, data: upload });
        } catch (err) {
            return next(err);
        }
    };

    listCompanyDocuments = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const { companyId } = CompanyDocumentParamsSchema.parse(req.params);
            const items = await this.companyDocumentService.listCompanyDocuments(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };

    createCompanyDocument = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId } = CompanyDocumentParamsSchema.parse(req.params);
            const input = CreateCompanyDocumentSchema.parse(req.body);

            await this.companyDocumentService.createCompanyDocument(companyId, userId, input);

            const items = await this.companyDocumentService.listCompanyDocuments(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };

    updateCompanyDocument = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId, documentId } = CompanyDocumentItemParamsSchema.parse(req.params);
            const input = UpdateCompanyDocumentSchema.parse(req.body);

            await this.companyDocumentService.updateCompanyDocument(
                companyId,
                documentId,
                userId,
                input
            );

            const items = await this.companyDocumentService.listCompanyDocuments(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };

    deleteCompanyDocument = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId, documentId } = CompanyDocumentItemParamsSchema.parse(req.params);

            const result = await this.companyDocumentService.deleteCompanyDocument(
                companyId,
                documentId,
                userId
            );

            if (result.s3Key) {
                await deleteObjectByKey(result.s3Key);
            }

            const items = await this.companyDocumentService.listCompanyDocuments(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };
}