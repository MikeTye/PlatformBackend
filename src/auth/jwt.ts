import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "7d";

export type JwtUser = { id: string; email: string };

export function signToken(user: JwtUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtUser {
  return jwt.verify(token, JWT_SECRET) as JwtUser;
}