import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const ProjectStageSchema = z.enum([
    'Exploration',
    'Concept',
    'Design',
    'Listed',
    'Validation',
    'Registered',
    'Issued',
    'Closed',
]);

export const ProjectVisibilitySchema = z.enum(['public', 'private']);

export const ProjectSectionKeySchema = z.enum([
    'overview',
    'story',
    'location',
    'readiness',
    'registry',
    'impact',
    'opportunities',
    'updates',
    'documents',
    'media',
    'team',
]);

export const ProjectRoleSchema = z.enum(['creator', 'viewer']);

const ProjectPermissionSchema = ProjectRoleSchema.nullable().optional();
export const SectionVisibilitySchema = z.enum(['public', 'private']);

export const ProjectSectionVisibilityMapSchema = z
    .object({
        overview: SectionVisibilitySchema.optional(),
        story: SectionVisibilitySchema.optional(),
        location: SectionVisibilitySchema.optional(),
        readiness: SectionVisibilitySchema.optional(),
        registry: SectionVisibilitySchema.optional(),
        impact: SectionVisibilitySchema.optional(),
        opportunities: SectionVisibilitySchema.optional(),
        updates: SectionVisibilitySchema.optional(),
        documents: SectionVisibilitySchema.optional(),
        media: SectionVisibilitySchema.optional(),
        team: SectionVisibilitySchema.optional(),
    })
    .strict();

const nullableTrimmedString = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
        if (value == null) return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    });

const CoordinatesSchema = z
    .object({
        lat: z.number().finite(),
        lng: z.number().finite(),
    })
    .nullable()
    .optional()
    .default(null);

const csvStringArraySchema = z
    .union([z.string(), z.array(z.string()), z.undefined()])
    .transform((value) => {
        if (Array.isArray(value)) {
            return value.map((v) => v.trim()).filter(Boolean);
        }

        if (typeof value === "string") {
            return value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
        }

        return [];
    });

export const ProjectOpportunitySchema = z.object({
    id: z.string().uuid().or(z.string().min(1)).optional(),
    type: z.string().trim().min(1),
    description: z.string().trim().nullable().optional(),
    urgent: z.boolean().optional(),
});

const ProjectTeamMemberInputSchema = z
    .object({
        memberType: z.enum(["user", "company"]),

        memberId: z.string().uuid().nullable().optional(),
        userId: z.string().uuid().nullable().optional(),
        companyId: z.string().uuid().nullable().optional(),

        role: z.string().trim().nullable().optional(),
        permission: ProjectPermissionSchema,

        isPlatformMember: z.boolean().optional().default(true),
        manualName: z.string().trim().nullable().optional(),
        manualOrganization: z.string().trim().nullable().optional(),

        // tolerate FE payload shape
        name: z.string().trim().nullable().optional(),
        companyName: z.string().trim().nullable().optional(),
        avatarUrl: z.string().trim().nullable().optional(),
    })
    .superRefine((val, ctx) => {
        const isPlatformMember = val.isPlatformMember !== false;

        if (isPlatformMember) {
            if (val.memberType === "user" && !(val.userId || val.memberId)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["userId"],
                    message: "Platform user collaborators require a user id",
                });
            }

            if (val.memberType === "company" && !(val.companyId || val.memberId)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["companyId"],
                    message: "Platform company collaborators require a company id",
                });
            }
        } else {
            if (val.memberType === "user") {
                const manualName = (val.manualName ?? val.name ?? "").trim();
                if (!manualName) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["manualName"],
                        message: "External individual collaborators require a name",
                    });
                }
            }

            if (val.memberType === "company") {
                const manualOrg = (val.manualOrganization ?? val.companyName ?? val.name ?? "").trim();
                if (!manualOrg) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["manualOrganization"],
                        message: "External companies require an organization name",
                    });
                }
            }
        }

        if (val.memberType === "user" && val.permission == null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["permission"],
                message: "User collaborators require a permission",
            });
        }

        if (val.memberType === "company" && val.permission !== null && val.permission !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["permission"],
                message: "Company collaborators must not carry a permission",
            });
        }
    });

const ProjectTeamMemberCreateSchema = ProjectTeamMemberInputSchema;
const ProjectTeamMemberUpdateSchema = ProjectTeamMemberInputSchema;

export const CreateProjectSchema = z.object({
    companyId: z.string().uuid().nullable().optional().default(null),
    name: nonEmptyTrimmedString,
    tagline: z.string().trim().optional().default(""),
    type: nonEmptyTrimmedString,
    stage: ProjectStageSchema,
    projectVisibility: ProjectVisibilitySchema.optional().default('private'),
    country: nonEmptyTrimmedString,
    state: nullableTrimmedString,
    coordinates: CoordinatesSchema,
    story: z.string().trim().optional().default(""),
    approach: z.string().trim().optional().default(""),
    opportunities: z.array(ProjectOpportunitySchema).default([]),

    // optional on create, but nice to support immediately
    sectionVisibility: ProjectSectionVisibilityMapSchema.optional(),
    team: z.array(ProjectTeamMemberCreateSchema).optional().default([]),
});

export const ListProjectsQuerySchema = z.object({
    scope: z.enum(["all", "my", "saved"]).optional().default("all"),
    q: nullableTrimmedString,
    stage: csvStringArraySchema,
    projectType: csvStringArraySchema,
    hostCountry: csvStringArraySchema,
    opportunity: csvStringArraySchema,
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z
        .enum(["name", "developer", "stage", "type", "country", "updated"])
        .optional()
        .default("updated"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type ListProjectsQueryInput = z.infer<typeof ListProjectsQuerySchema>;

export const ProjectDetailParamsSchema = z.object({
    id: z.string().uuid(),
});

export type ProjectDetailParamsInput = z.infer<typeof ProjectDetailParamsSchema>;

export type GetProjectResponse = {
    id: string;
    upid: string | null;
    name: string;
    stage: 'Exploration' | 'Concept' | 'Design' | 'Listed' | 'Validation' | 'Registered' | 'Issued' | 'Closed';
    type: string | null;
    description: string | null;
    companyName: string | null;
    country: string | null;
    region: string | null;
    coverImageUrl: string | null;

    projectVisibility: 'public' | 'private' | null;

    storyProblem: string | null;
    storyApproach: string | null;

    methodology: string | null;
    methodologyId?: string | null;
    methodologyNotes?: string | null;
    projectMethodologyDocUrl?: string | null;

    registrationPlatform: string | null;
    registryStatus: string | null;
    auditStatus?: string | null;
    registryId: string | null;
    registryProjectUrl?: string | null;
    registryDate?: string | null;

    registrationDateExpected?: string | null;
    registrationDateActual?: string | null;
    creditIssuanceDate?: string | null;

    implementationStart?: string | null;
    implementationEnd?: string | null;
    creditingStart?: string | null;
    creditingEnd?: string | null;
    inceptionDate?: string | null;
    completionDate?: string | null;

    tenureText?: string | null;

    totalAreaHa: number | null;
    estimatedAnnualRemoval: string | null;
    totalCreditsIssued?: number | null;
    annualEstimatedCredits?: number | null;
    annualEstimateUnit?: string | null;
    firstVintageYear?: number | null;

    readiness: Array<{ id: string; label: string; status: 'yes' | 'progress' | 'seeking' | 'na'; note?: string | null }>;
    opportunities: Array<{ id: string; type: string; description?: string | null; urgent?: boolean }>;

    updates: Array<{
        id: string;
        title: string;
        description?: string | null;
        dateLabel?: string | null;
        authorName?: string | null;
        type?: 'progress' | 'stage' | null;
    }>;

    documents: Array<{ id: string; name: string; type?: string | null; status?: string | null; dateLabel?: string | null }>;
    media: Array<{ id: string; url: string; caption?: string | null; dateLabel?: string | null }>;
    team: Array<{
        id: string;
        memberType: 'user' | 'company';
        memberId: string;
        userId?: string | null;
        companyId?: string | null;
        name: string;
        role?: string;
        companyName?: string;
        avatarUrl?: string | null;
        permission?: 'creator' | 'viewer';
        isPlatformMember?: boolean;
        manualName?: string | null;
        manualOrganization?: string | null;
    }>;
    sectionVisibility: Partial<Record<
        | "overview"
        | "story"
        | "location"
        | "readiness"
        | "registry"
        | "impact"
        | "opportunities"
        | "updates"
        | "documents"
        | "media"
        | "team",
        "public" | "private"
    >>;

    myRole: 'creator' | 'viewer' | null;
    saved: boolean;
};

export const UpdateProjectVisibilityParamsSchema = z.object({
    id: z.string().uuid(),
});

export const UpdateProjectVisibilityBodySchema = z.object({
    projectVisibility: ProjectVisibilitySchema,
}).strict();

export const DeleteProjectParamsSchema = z.object({
    id: z.string().uuid(),
});

export type UpdateProjectVisibilityParams = z.infer<typeof UpdateProjectVisibilityParamsSchema>;
export type UpdateProjectVisibilityBody = z.infer<typeof UpdateProjectVisibilityBodySchema>;
export type DeleteProjectParams = z.infer<typeof DeleteProjectParamsSchema>;

export const ProjectReadinessItemSchema = z.object({
    id: z.string().uuid().or(z.string().min(1)),
    label: z.string().trim().min(1),
    status: z.enum(['yes', 'progress', 'seeking', 'na']),
    note: z.string().trim().nullable().optional(),
});

export const CreateProjectUpdateParamsSchema = z.object({
    id: z.string().uuid(),
});

export type CreateProjectUpdateParams = z.infer<typeof CreateProjectUpdateParamsSchema>;

export const ProjectTeamMemberSchema = z.object({
    id: z.string().uuid().or(z.string().min(1)),
    name: z.string().trim().min(1),
    role: z.string().trim().optional(),
    companyName: z.string().trim().optional(),
    avatarUrl: z.string().trim().url().nullable().optional(),
});

export const GetProjectParamsSchema = z.object({
    id: z.string().uuid(),
});

export const UpdateProjectParamsSchema = z.object({
    id: z.string().uuid(),
});

const ProjectUpdateSchema = z.object({
    id: z.string().uuid().or(z.string().min(1)).optional(),
    title: z.string().trim().min(1),
    description: z.string().trim().nullable().optional(),
    dateLabel: z.string().trim().nullable().optional(),
    authorName: z.string().trim().nullable().optional(),
    type: z.enum(['progress', 'stage']).nullable().optional(),
});

export const UpdateProjectBodySchema = z.object({
    name: z.string().trim().min(1).optional(),
    stage: ProjectStageSchema.optional(),
    type: z.string().trim().nullable().optional(),
    description: z.string().trim().nullable().optional(),

    country: z.string().trim().nullable().optional(),
    region: z.string().trim().nullable().optional(),
    latitude: z.number().finite().nullable().optional(),
    longitude: z.number().finite().nullable().optional(),

    storyProblem: z.string().trim().nullable().optional(),
    storyApproach: z.string().trim().nullable().optional(),

    methodology: z.string().trim().nullable().optional(),
    methodologyId: z.string().uuid().nullable().optional(),
    methodologyNotes: z.string().trim().nullable().optional(),
    projectMethodologyDocUrl: z.string().trim().nullable().optional(),

    // preferred names
    registrationPlatform: z.string().trim().nullable().optional(),
    registryId: z.string().trim().nullable().optional(),
    registryProjectUrl: z.string().trim().nullable().optional(),

    registryStatus: z.string().trim().nullable().optional(),
    auditStatus: z.string().trim().nullable().optional(),

    registryDate: z.string().trim().nullable().optional(),
    registrationDateExpected: z.string().trim().nullable().optional(),
    registrationDateActual: z.string().trim().nullable().optional(),
    creditIssuanceDate: z.string().trim().nullable().optional(),

    implementationStart: z.string().trim().nullable().optional(),
    implementationEnd: z.string().trim().nullable().optional(),
    creditingStart: z.string().trim().nullable().optional(),
    creditingEnd: z.string().trim().nullable().optional(),
    inceptionDate: z.string().trim().nullable().optional(),
    completionDate: z.string().trim().nullable().optional(),

    tenureText: z.string().trim().nullable().optional(),

    totalAreaHa: z.number().finite().nullable().optional(),
    estimatedAnnualRemoval: z.string().trim().nullable().optional(),
    totalCreditsIssued: z.number().finite().nullable().optional(),
    annualEstimatedCredits: z.number().finite().nullable().optional(),
    annualEstimateUnit: z.string().trim().nullable().optional(),
    firstVintageYear: z.number().int().nullable().optional(),

    opportunities: z.array(ProjectOpportunitySchema).optional(),
    team: z.array(ProjectTeamMemberUpdateSchema).optional(),
    sectionVisibility: ProjectSectionVisibilityMapSchema.optional(),
    updates: z.array(ProjectUpdateSchema).optional(),
    projectVisibility: ProjectVisibilitySchema.optional(),
}).strict();

export type GetProjectParams = z.infer<typeof GetProjectParamsSchema>;
export type UpdateProjectParams = z.infer<typeof UpdateProjectParamsSchema>;
export type UpdateProjectBody = z.infer<typeof UpdateProjectBodySchema>;

export const ListProjectUpdatesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

export type ListProjectUpdatesQuery = z.infer<typeof ListProjectUpdatesQuerySchema>;