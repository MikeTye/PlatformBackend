import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtUser } from "../auth/jwt.js";

export interface AuthedRequest extends Request {
  user?: JwtUser;
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}