import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

const parseJsonStringArray = (fieldName: string) =>
    z
        .union([
            z.array(nonEmptyTrimmedString),
            z.string().transform((value, ctx) => {
                try {
                    const parsed = JSON.parse(value);
                    if (!Array.isArray(parsed)) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `${fieldName} must be an array`,
                        });
                        return z.NEVER;
                    }

                    return parsed.map((v) => String(v).trim()).filter(Boolean);
                } catch {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `${fieldName} must be valid JSON array`,
                    });
                    return z.NEVER;
                }
            }),
        ])
        .transform((value) => (Array.isArray(value) ? value : value));

const parseCsvArray = z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
        if (!value) return [];
        if (Array.isArray(value)) {
            return [...new Set(value.map((v) => v.trim()).filter(Boolean))];
        }

        return [
            ...new Set(
                value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
            ),
        ];
    });

export const CreateCompanySchema = z.object({
    name: nonEmptyTrimmedString,
    description: z.string().trim().optional().default(""),
    country: nonEmptyTrimmedString,
    roles: parseJsonStringArray("roles").default([]),
    serviceCategories: parseJsonStringArray("serviceCategories").default([]),
    projectTypes: parseJsonStringArray("projectTypes").default([]),
    otherProjectType: z.string().trim().optional().default(""),
    regions: parseJsonStringArray("regions").default([]),
});

export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;

const CompanyScopeSchema = z.enum(["all", "mine", "saved"]);
const CompanyTabSchema = z.enum(["all", "mine", "saved"]);

export const ListCompaniesQuerySchema = z
    .object({
        scope: CompanyScopeSchema.optional(),
        tab: CompanyTabSchema.optional(),
        q: z.string().trim().optional().default(""),
        roles: parseCsvArray.default([]),
        serviceCategories: parseCsvArray.default([]),
        countries: parseCsvArray.default([]),
        page: z.coerce.number().int().min(1).optional().default(1),
        pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
        sortField: z
            .enum(["displayName", "country", "projects", "createdAt"])
            .optional()
            .default("displayName"),
        sortDirection: z.enum(["asc", "desc"]).optional().default("asc"),
    })
    .transform((value) => {
        const normalizedScope =
            value.scope ??
            (value.tab === "mine" ? "mine" : value.tab === "saved" ? "saved" : "all");

        return {
            ...value,
            roles: value.roles ?? [],
            serviceCategories: value.serviceCategories ?? [],
            countries: value.countries ?? [],
            scope: normalizedScope as "all" | "mine" | "saved",
        };
    });

export type ListCompaniesQuery = z.infer<typeof ListCompaniesQuerySchema>;

export const GetCompanyDetailParamsSchema = z.object({
    companyIdOrSlug: z.string().min(1),
});

export type GetCompanyDetailParams = z.infer<typeof GetCompanyDetailParamsSchema>;

export const CompanySectionKeySchema = z.enum([
    "header",
    "about",
    "team",
    "media",
    "documents",
    "projects",
    "services",
    "serviceCategories",
    "projectTypes",
    "geographicalCoverage",
    "permissions",
]);

export type CompanySectionKey = z.infer<typeof CompanySectionKeySchema>;

const CompanyPrivacyLevelSchema = z.enum(["public", "company_users"]);
export type CompanyPrivacyLevel = z.infer<typeof CompanyPrivacyLevelSchema>;

export const CompanyPrivacyPatchSchema = z.object({
    header: CompanyPrivacyLevelSchema.optional(),
    about: CompanyPrivacyLevelSchema.optional(),
    team: CompanyPrivacyLevelSchema.optional(),
    media: CompanyPrivacyLevelSchema.optional(),
    documents: CompanyPrivacyLevelSchema.optional(),
    projects: CompanyPrivacyLevelSchema.optional(),
    services: CompanyPrivacyLevelSchema.optional(),
    serviceCategories: CompanyPrivacyLevelSchema.optional(),
    projectTypes: CompanyPrivacyLevelSchema.optional(),
    geographicalCoverage: CompanyPrivacyLevelSchema.optional(),
    permissions: CompanyPrivacyLevelSchema.optional(),
});

export type CompanyPrivacyPatchInput = z.infer<typeof CompanyPrivacyPatchSchema>;

const CompanyPermissionSchema = z.object({
    id: z.string().uuid().optional(),
    userId: z.string().uuid(),
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    role: z.string().trim().nullable().optional(),
    permission: z.enum(["creator", "viewer"]),
    deleteFlag: z.boolean().optional(),
});

export const UpdateCompanyDetailSchema = z.object({
    legalName: z.string().trim().min(1).optional(),
    displayName: z.string().trim().optional().nullable(),
    description: z.string().trim().optional().nullable(),
    fullDescription: z.string().trim().optional().nullable(),
    website: z.string().trim().optional().nullable(),
    country: z.string().trim().optional().nullable(),
    countryCode: z.string().trim().optional().nullable(),

    roles: z.array(nonEmptyTrimmedString).optional(),
    serviceTypes: z.array(nonEmptyTrimmedString).optional(),
    serviceCategories: z.array(nonEmptyTrimmedString).optional(),
    services: z.array(nonEmptyTrimmedString).optional(),
    projectTypes: z.array(nonEmptyTrimmedString).optional(),
    geographicalCoverage: z.array(nonEmptyTrimmedString).optional(),

    privacy: CompanyPrivacyPatchSchema.optional(),

    permissions: z.array(CompanyPermissionSchema).optional(),
    inheritCompanyPermissionsToProjects: z.boolean().optional(),
});

export type UpdateCompanyDetailInput = z.infer<typeof UpdateCompanyDetailSchema>;

export const CompanyInviteLinkParamsSchema = z.object({
    companyId: z.string().uuid(),
});

export type CompanyInviteLinkParams = z.infer<typeof CompanyInviteLinkParamsSchema>;

export const CompanyInviteLinkResponseSchema = z.object({
    inviteLinkId: z.string().uuid(),
    companyId: z.string().uuid(),
    token: z.string().min(1),
    isActive: z.boolean(),
    externalInviteUrl: z.string().url(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type CompanyInviteLinkResponse = z.infer<typeof CompanyInviteLinkResponseSchema>;