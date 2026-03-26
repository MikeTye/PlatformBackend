import { Router } from "express";
import type { Pool } from "pg";
import { UserController } from "./userController.js";
import { UserService } from "./userService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export function buildUserRouter(db: Pool): Router {
  const router = Router();

  const service = new UserService(db);
  const controller = new UserController(service);

  router.get("/options", requireAuth, controller.listUserOptions);

  return router;
}