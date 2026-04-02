import type { Response, NextFunction } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import { UpdateMyOnboardingSchema } from "./schema.js";
import { OnboardingService } from "./onboardingService.js";
import { uploadOnboardingCompanyLogo } from "../lib/s3Media.js";

export class OnboardingController {
    constructor(private readonly onboardingService: OnboardingService) { }

    getMyOnboarding = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const data = await this.onboardingService.getMyOnboarding(userId);
            return res.json({ ok: true, data });
        } catch (err) {
            return next(err);
        }
    };

    updateMyOnboarding = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const input = UpdateMyOnboardingSchema.parse(req.body);
            const data = await this.onboardingService.updateMyOnboarding(userId, input);

            return res.json({ ok: true, data });
        } catch (err) {
            return next(err);
        }
    };

    uploadOnboardingCompanyLogo = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            if (!req.file) {
                return res.status(400).json({ ok: false, error: "Logo file is required" });
            }

            const uploaded = await uploadOnboardingCompanyLogo({
                userId,
                originalName: req.file.originalname,
                contentType: req.file.mimetype,
                body: req.file.buffer,
            });

            return res.status(200).json({
                ok: true,
                data: {
                    tempKey: uploaded.key,
                    tempAssetUrl: uploaded.assetUrl,
                    contentType: req.file.mimetype,
                    originalName: req.file.originalname,
                    sha256: uploaded.sha256,
                },
            });
        } catch (err) {
            return next(err);
        }
    };
}