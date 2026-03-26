import { Router } from "express";
import type { AuthController } from "./authController.js";

export function buildAuthRoutes(controller: AuthController) {
  const router = Router();

  router.post("/email/request-code", controller.requestCode);
  router.post("/email/verify-code", controller.verifyCode);
  router.post("/google/sign-in", controller.googleSignIn);
  router.get("/me", controller.me);
  router.post("/logout", controller.logout);

  return router;
}