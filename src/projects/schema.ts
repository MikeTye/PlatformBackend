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

const ProjectTeamMemberCreateSchema = z.object({
    memberType: z.enum(["user", "company"]),
    memberId: z.string().uuid(),

    userId: z.string().uuid().nullable().optional(),
    companyId: z.string().uuid().nullable().optional(),

    role: z.string().trim().nullable().optional(),
    permission: ProjectPermissionSchema,
}).refine((val) => {
    if (val.memberType === "user") {
        return !!(val.userId || val.memberId);
    }
    if (val.memberType === "company") {
        return !!(val.companyId || val.memberId);
    }
    return false;
}, {
    message: "Invalid team member configuration",
}).superRefine((val, ctx) => {
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

export const ProjectOpportunitySchema = z.object({
    id: z.string().uuid().or(z.string().min(1)).optional(),
    type: z.string().trim().min(1),
    description: z.string().trim().nullable().optional(),
    urgent: z.boolean().optional(),
});

export const CreateProjectSchema = z.object({
    companyId: z.string().uuid().nullable().optional().default(null),
    name: nonEmptyTrimmedString,
    tagline: z.string().trim().optional().default(""),
    type: nonEmptyTrimmedString,
    stage: ProjectStageSchema,
    visibility: nonEmptyTrimmedString, // keep for now if the column exists, even if project-level visibility is ignored
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

    storyProblem: string | null;
    storyApproach: string | null;

    methodology: string | null;
    registryName: string | null;
    registryStatus: string | null;
    registryProjectId: string | null;

    totalAreaHa: number | null;
    estimatedAnnualRemoval: string | null;

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

export const ProjectReadinessItemSchema = z.object({
    id: z.string().uuid().or(z.string().min(1)),
    label: z.string().trim().min(1),
    status: z.enum(['yes', 'progress', 'seeking', 'na']),
    note: z.string().trim().nullable().optional(),
});

export const CreateProjectUpdateParamsSchema = z.object({
    id: z.string().uuid(),
});

export const CreateProjectUpdateBodySchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().nullable().optional(),
    dateLabel: z.string().trim().nullable().optional(),
    authorName: z.string().trim().nullable().optional(),
    type: z.enum(["progress", "stage"]).optional().default("progress"),
}).strict();

export type CreateProjectUpdateParams = z.infer<typeof CreateProjectUpdateParamsSchema>;
export type CreateProjectUpdateBody = z.infer<typeof CreateProjectUpdateBodySchema>;

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

const ProjectDocumentSchema = z.object({
    id: z.string().uuid().or(z.string().min(1)).optional(),
    name: z.string().trim().min(1),
    type: z.string().trim().nullable().optional(),
    status: z.string().trim().nullable().optional(),
    dateLabel: z.string().trim().nullable().optional(),
});

const ProjectMediaSchema = z.object({
    id: z.string().uuid().or(z.string().min(1)).optional(),
    url: z.string().trim().min(1),
    caption: z.string().trim().nullable().optional(),
    dateLabel: z.string().trim().nullable().optional(),
});

const ProjectTeamMemberUpdateSchema = z.object({
    memberType: z.enum(["user", "company"]),
    memberId: z.string().uuid(),

    userId: z.string().uuid().nullable().optional(),
    companyId: z.string().uuid().nullable().optional(),

    role: z.string().trim().nullable().optional(),
    permission: ProjectPermissionSchema,
}).refine((val) => {
    if (val.memberType === "user") {
        return !!(val.userId || val.memberId);
    }
    if (val.memberType === "company") {
        return !!(val.companyId || val.memberId);
    }
    return false;
}, {
    message: "Invalid team member configuration",
}).superRefine((val, ctx) => {
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

export const UpdateProjectBodySchema = z.object({
    name: z.string().trim().min(1).optional(),
    stage: ProjectStageSchema.optional(),
    type: z.string().trim().nullable().optional(),
    description: z.string().trim().nullable().optional(),

    country: z.string().trim().nullable().optional(),
    region: z.string().trim().nullable().optional(),

    storyProblem: z.string().trim().nullable().optional(),
    storyApproach: z.string().trim().nullable().optional(),

    methodology: z.string().trim().nullable().optional(),
    registryName: z.string().trim().nullable().optional(),
    registryStatus: z.string().trim().nullable().optional(),
    registryProjectId: z.string().trim().nullable().optional(),

    totalAreaHa: z.number().nullable().optional(),
    estimatedAnnualRemoval: z.string().trim().nullable().optional(),

    readiness: z.array(ProjectReadinessItemSchema).optional(),
    opportunities: z.array(ProjectOpportunitySchema).optional(),

    team: z.array(ProjectTeamMemberUpdateSchema).optional(),

    sectionVisibility: ProjectSectionVisibilityMapSchema.optional(),

    updates: z.array(ProjectUpdateSchema).optional(),
    documents: z.array(ProjectDocumentSchema).optional(),
    media: z.array(ProjectMediaSchema).optional(),
    coverImageUrl: z.string().trim().nullable().optional(),
}).strict();

export type GetProjectParams = z.infer<typeof GetProjectParamsSchema>;
export type UpdateProjectParams = z.infer<typeof UpdateProjectParamsSchema>;
export type UpdateProjectBody = z.infer<typeof UpdateProjectBodySchema>;

export const ListProjectUpdatesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

export type ListProjectUpdatesQuery = z.infer<typeof ListProjectUpdatesQuerySchema>;

export const ListProjectOpportunitiesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

export type ListProjectOpportunitiesQuery = z.infer<
    typeof ListProjectOpportunitiesQuerySchema
>;