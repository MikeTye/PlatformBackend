import { z } from "zod";

const AuthIntentSchema = z.enum(["login", "signup"]);

const OptionalCompanyInviteTokenSchema = z
    .string()
    .trim()
    .min(1)
    .max(512)
    .optional();

export const RequestCodeSchema = z.object({
    email: z.email(),
    intent: AuthIntentSchema,
    name: z.string().trim().min(1).max(120).optional(),
    companyInviteToken: OptionalCompanyInviteTokenSchema,
});

export const VerifyCodeSchema = z.object({
    email: z.email(),
    code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
    intent: AuthIntentSchema,
    name: z.string().trim().min(1).max(120).optional(),
    companyInviteToken: OptionalCompanyInviteTokenSchema,
});

export const GoogleSignInSchema = z.object({
    credential: z.string().trim().min(1, "Google credential is required"),
    intent: AuthIntentSchema,
    agreedToTerms: z.boolean().optional(),
    companyInviteToken: OptionalCompanyInviteTokenSchema,
}).superRefine((data, ctx) => {
    if (data.intent === "signup" && data.agreedToTerms !== true) {
        ctx.addIssue({
            code: "custom",
            path: ["agreedToTerms"],
            message: "You must agree to the Terms & Conditions before signing up.",
        });
    }
});