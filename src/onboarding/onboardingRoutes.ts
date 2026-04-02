import { Router } from "express";
import type { Pool } from "pg";
import multer from "multer";
import { OnboardingService } from "./onboardingService.js";
import { OnboardingController } from "./onboardingController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1 * 1024 * 1024, // keep aligned with frontend 1MB check
    },
});

export function createOnboardingRoutes(db: Pool) {
    const router = Router();

    const onboardingService = new OnboardingService(db);
    const onboardingController = new OnboardingController(onboardingService);

    router.get("/me/onboarding", requireAuth, onboardingController.getMyOnboarding);
    router.patch("/me/onboarding", requireAuth, onboardingController.updateMyOnboarding);

    router.post(
        "/me/onboarding/company-logo",
        requireAuth,
        upload.single("logo"),
        onboardingController.uploadOnboardingCompanyLogo
    );

    return router;
}