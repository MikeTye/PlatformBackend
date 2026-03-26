import { Router } from "express";
import type { Pool } from "pg";
import { OnboardingService } from "./onboardingService.js";
import { OnboardingController } from "./onboardingController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export function createOnboardingRoutes(db: Pool) {
    const router = Router();

    const onboardingService = new OnboardingService(db);
    const onboardingController = new OnboardingController(onboardingService);

    router.get("/me/onboarding", requireAuth, onboardingController.getMyOnboarding);
    router.patch("/me/onboarding", requireAuth, onboardingController.updateMyOnboarding);

    return router;
}