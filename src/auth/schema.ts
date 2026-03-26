import { z } from "zod";

const AuthIntentSchema = z.enum(["login", "signup"]);

export const RequestCodeSchema = z.object({
    email: z.email(),
    intent: AuthIntentSchema,
});

export const VerifyCodeSchema = z.object({
    email: z.email(),
    code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
    intent: AuthIntentSchema,
    name: z.string().trim().min(1).max(120).optional(),
});

export const GoogleSignInSchema = z.object({
    credential: z.string().trim().min(1, "Google credential is required"),
    intent: AuthIntentSchema,
});