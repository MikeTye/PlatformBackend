import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    getUploadUrlForCompanyMedia,
    deleteObjectByKey,
} from "../lib/s3Media.js";
import { CompanyMediaService } from "./companyMediaService.js";
import {
    CompanyMediaParamsSchema,
    CompanyMediaItemParamsSchema,
    CompanyMediaUploadUrlQuerySchema,
    CreateCompanyMediaSchema,
    UpdateCompanyMediaSchema,
} from "./schema.js";

function getFileExt(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed.includes(".")) return "bin";
    return trimmed.split(".").pop() || "bin";
}

export class CompanyMediaController {
    constructor(private readonly companyMediaService: CompanyMediaService) { }

    getCompanyMediaUploadUrl = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId } = CompanyMediaParamsSchema.parse(req.params);
            const { fileName, contentType } = CompanyMediaUploadUrlQuerySchema.parse(req.query);

            await this.companyMediaService.assertCanUpload(companyId, userId);
            
            const upload = await getUploadUrlForCompanyMedia(
                companyId,
                getFileExt(fileName),
                contentType
            );

            return res.status(200).json({ ok: true, data: upload });
        } catch (err) {
            return next(err);
        }
    };

    listCompanyMedia = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const { companyId } = CompanyMediaParamsSchema.parse(req.params);
            const items = await this.companyMediaService.listCompanyMedia(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };

    createCompanyMedia = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId } = CompanyMediaParamsSchema.parse(req.params);
            const input = CreateCompanyMediaSchema.parse(req.body);

            await this.companyMediaService.createCompanyMedia(companyId, userId, input);

            const items = await this.companyMediaService.listCompanyMedia(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };

    updateCompanyMedia = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId, mediaId } = CompanyMediaItemParamsSchema.parse(req.params);
            const input = UpdateCompanyMediaSchema.parse(req.body);

            await this.companyMediaService.updateCompanyMedia(companyId, mediaId, userId, input);

            const items = await this.companyMediaService.listCompanyMedia(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };

    deleteCompanyMedia = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId, mediaId } = CompanyMediaItemParamsSchema.parse(req.params);

            const result = await this.companyMediaService.deleteCompanyMedia(
                companyId,
                mediaId,
                userId
            );

            await this.companyMediaService.cleanupDeletedCompanyMediaObjects(result.s3Keys);

            const items = await this.companyMediaService.listCompanyMedia(companyId);
            return res.status(200).json({ ok: true, data: items, items });
        } catch (err) {
            return next(err);
        }
    };
}