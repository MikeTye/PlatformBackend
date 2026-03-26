import { z } from "zod";

const trimmedOptionalString = z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => {
        if (value === undefined) return undefined;
        return value === "" ? "" : value;
    });

const stringArray = z.array(z.string().trim().min(1).max(100)).default([]);

export const accountProfileSchema = z.object({
    fullName: z.string().trim().max(255).default(""),
    headline: z.string().trim().max(255).default(""),
    jobTitle: z.string().trim().max(255).default(""),
    bio: z.string().trim().max(5000).default(""),
    phoneNumber: z.string().trim().max(100).default(""),
    contactEmail: z.string().trim().email().or(z.literal("")).default(""),
    country: z.string().trim().max(120).default(""),
    city: z.string().trim().max(120).default(""),
    timezone: z.string().trim().max(120).default("Asia/Kuala_Lumpur"),
    roleType: z.string().trim().max(120).default(""),
    expertiseTags: stringArray,
    serviceOfferings: stringArray,
    sectors: stringArray,
    standards: stringArray,
    languages: stringArray,
    personalWebsite: z.string().trim().url().or(z.literal("")).default(""),
    linkedinUrl: z.string().trim().url().or(z.literal("")).default(""),
    portfolioUrl: z.string().trim().url().or(z.literal("")).default(""),
    isPublic: z.boolean().default(true),
    showPhone: z.boolean().default(false),
    showContactEmail: z.boolean().default(false),
});

export const updateAccountSchema = z.object({
    profile: accountProfileSchema,
    // kept for frontend compatibility for now, but ignored by this module
    affiliations: z
        .array(
            z.object({
                id: z.string().uuid().optional(),
                companyId: z.string().uuid().nullable(),
                role: z.string().trim().max(255),
                permission: z.enum(["creator", "viewer"]),
            })
        )
        .default([]),
});

export type AccountProfileInput = z.infer<typeof accountProfileSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;