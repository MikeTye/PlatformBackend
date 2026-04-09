import type { Pool } from "pg";
import type { CreateProjectInput, UpdateProjectBody } from "./schema.js";
import { toPublicAssetUrl } from "../lib/s3Media.js";

export type ProjectListScope = "all" | "my" | "saved";
export type ProjectListSortBy =
    | "name"
    | "developer"
    | "stage"
    | "type"
    | "country"
    | "updated";

export type ListProjectsInput = {
    userId?: string | null;
    scope?: ProjectListScope;
    q?: string | null;
    stage?: string[];
    projectType?: string[];
    hostCountry?: string[];
    opportunity?: string[];
    page?: number;
    pageSize?: number;
    sortBy?: ProjectListSortBy;
    sortDir?: "asc" | "desc";
};

export type ProjectListItem = {
    id: string;
    upid: string;
    name: string;
    developer: string;
    description: string | null;
    stage: string;
    type: string;
    country: string | null;
    countryCode: string | null;
    region: string | null;
    lat: number | null;
    lng: number | null;
    updatedAt: string;
    opportunities: string[];
    isSaved: boolean;
    isMine: boolean;
    visibility: "public" | "private" | null;

    coverImageUrl: string | null;
    coverThumbUrl: string | null;
};

export type ProjectFacetOption = {
    value: string;
    count: number;
};

export type ListProjectsResult = {
    items: ProjectListItem[];
    total: number;
    page: number;
    pageSize: number;
    sortBy: NonNullable<ListProjectsInput["sortBy"]>;
    sortDir: NonNullable<ListProjectsInput["sortDir"]>;
    counts: {
        all: number;
        my: number;
        saved: number;
    };
    filters: {
        stages: ProjectFacetOption[];
        types: ProjectFacetOption[];
        countries: ProjectFacetOption[];
        opportunities: ProjectFacetOption[];
    };
};

export type GetProjectDetailInput = {
    projectId: string;
    userId?: string | null;
};

export type ProjectDetailMediaItem = {
    id: string;
    kind: string;
    assetUrl: string;
    contentType: string | null;
    caption: string | null;
    isCover: boolean;
    createdAt: string;
};

export type ProjectDetailDocumentItem = {
    id: string;
    kind: string;
    status: string | null;
    assetUrl: string;
    contentType: string | null;
    name: string | null;
    type: string | null;
    createdAt: string;
};

type CurrentUser = {
    userId: string | null;
};

const ALL_SECTION_KEYS = [
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
] as const;

type ProjectTeamMemberInput = {
    memberType: "user" | "company";
    memberId?: string | null;
    userId?: string | null;
    companyId?: string | null;
    role?: string | null;
    permission?: "creator" | "viewer" | null;
    isPlatformMember?: boolean;
    manualName?: string | null;
    manualOrganization?: string | null;

    // tolerate FE payload shape
    name?: string | null;
    companyName?: string | null;
};

type ProjectTeamMemberRow = {
    id: string;
    member_type: "user" | "company";
    member_user_id: string | null;
    member_company_id: string | null;
    is_platform_member: boolean;
    manual_name: string | null;
    manual_organization: string | null;
    role: string | null;
    permission: "creator" | "viewer" | null;
    display_name: string;
    email: string | null;
    company_name: string | null;
};

type ProjectSectionKey = typeof ALL_SECTION_KEYS[number];
type SectionVisibility = 'public' | 'private';
type ProjectRole = 'creator' | 'viewer' | null;

type ProjectOpportunityInput = {
    id?: string | undefined;
    type: string;
    description?: string | null | undefined;
    urgent?: boolean | undefined;
};

type ProjectOpportunityRecord = {
    id: string;
    project_id: string;
    opportunity_type: string;
    description: string | null;
    is_priority: boolean;
    sort_order: number;
    is_active: boolean;
    created_at: string;
};

export type CreateProjectOpportunityInput = {
    type: string | undefined;
    description?: string | null | undefined;
    urgent?: boolean | undefined;
    isActive?: boolean | undefined;
};

export type UpdateProjectOpportunityInput = {
    projectId?: string | undefined;
    type?: string | undefined;
    description?: string | null | undefined;
    urgent?: boolean | undefined;
    isActive?: boolean | undefined;
};

type ProjectUpdateInput = {
    id?: string | undefined;
    title: string;
    description?: string | null | undefined;
    dateLabel?: string | null | undefined;
    authorName?: string | null | undefined;
    type?: "progress" | "stage" | null | undefined;
};

export type RecentProjectUpdateListItem = {
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    description: string | null;
    dateLabel: string | null;
    authorName: string | null;
    type: "progress" | "stage";
    createdAt: string;
};

export type ListProjectUpdatesResult = {
    items: RecentProjectUpdateListItem[];
};

export type RecentProjectOpportunityListItem = {
    id: string;
    projectId: string;
    projectName: string;
    type: string;
    description: string | null;
    urgent: boolean;
    createdAt: string;

    // additive only
    projectUpid: string | null;
    stage: string | null;
    country: string | null;
    developer: string | null;
};

export type ListProjectOpportunitiesResult = {
    items: RecentProjectOpportunityListItem[];
};

function buildDescription(input: CreateProjectInput): string | null {
    const parts: string[] = [];

    if (input.tagline.trim()) {
        parts.push(`Tagline: ${input.tagline.trim()}`);
    }

    if (input.story.trim()) {
        parts.push(`Story:\n${input.story.trim()}`);
    }

    if (input.approach.trim()) {
        parts.push(`Approach:\n${input.approach.trim()}`);
    }

    return parts.length ? parts.join("\n\n") : null;
}

export class ProjectService {
    constructor(private readonly db: Pool) { }

    private applySectionVisibilityToDetail(
        detail: any,
        myRole: "creator" | "viewer" | null,
    ) {
        if (myRole === "creator" || myRole === "viewer") {
            return detail;
        }

        const visible = (key: ProjectSectionKey) =>
            (detail.sectionVisibility?.[key] ?? "public") === "public";

        return {
            ...detail,
            description: visible("overview") ? detail.description : null,
            methodology: visible("overview") ? detail.methodology : null,
            methodologyId: visible("overview") ? detail.methodologyId : null,
            methodologyNotes: visible("overview") ? detail.methodologyNotes : null,
            projectMethodologyDocUrl: visible("overview") ? detail.projectMethodologyDocUrl : null,

            totalAreaHa: visible("overview") || visible("impact") ? detail.totalAreaHa : null,
            estimatedAnnualRemoval:
                visible("overview") || visible("impact") ? detail.estimatedAnnualRemoval : null,

            storyProblem: visible("story") ? detail.storyProblem : null,
            storyApproach: visible("story") ? detail.storyApproach : null,

            country: visible("location") ? detail.country : null,
            region: visible("location") ? detail.region : null,
            latitude: visible("location") ? detail.latitude : null,
            longitude: visible("location") ? detail.longitude : null,

            readiness: visible("readiness") ? detail.readiness : [],

            registrationPlatform: visible("registry") ? detail.registrationPlatform : null,
            registryStatus: visible("registry") ? detail.registryStatus : null,
            auditStatus: visible("registry") ? detail.auditStatus : null,
            registryId: visible("registry") ? detail.registryId : null,
            registryProjectUrl: visible("registry") ? detail.registryProjectUrl : null,
            registryDate: visible("registry") ? detail.registryDate : null,
            registrationDateExpected: visible("registry") ? detail.registrationDateExpected : null,
            registrationDateActual: visible("registry") ? detail.registrationDateActual : null,
            tenureText: visible("registry") ? detail.tenureText : null,

            totalCreditsIssued:
                visible("overview") || visible("impact") ? detail.totalCreditsIssued : null,
            annualEstimatedCredits:
                visible("overview") || visible("impact") ? detail.annualEstimatedCredits : null,
            annualEstimateUnit:
                visible("overview") || visible("impact") ? detail.annualEstimateUnit : null,
            firstVintageYear:
                visible("overview") || visible("impact") ? detail.firstVintageYear : null,
            creditIssuanceDate:
                visible("overview") || visible("impact") ? detail.creditIssuanceDate : null,
            creditingStart:
                visible("overview") || visible("impact") ? detail.creditingStart : null,
            creditingEnd:
                visible("overview") || visible("impact") ? detail.creditingEnd : null,
            implementationStart:
                visible("overview") || visible("impact") ? detail.implementationStart : null,
            implementationEnd:
                visible("overview") || visible("impact") ? detail.implementationEnd : null,
            inceptionDate:
                visible("overview") || visible("impact") ? detail.inceptionDate : null,
            completionDate:
                visible("overview") || visible("impact") ? detail.completionDate : null,

            opportunities: visible("opportunities") ? detail.opportunities : [],
            updates: visible("updates") ? detail.updates : [],
            documents: visible("documents") ? detail.documents : [],
            media: visible("media") ? detail.media : [],
            coverImageUrl: visible("media") ? detail.coverImageUrl : null,
            team: visible("team") ? detail.team : [],
        };
    }

    private async loadProjectBaseRow(projectId: string) {
        const projectRes = await this.db.query(
            `
        SELECT
          p.id,
          p.upid,
          p.name,
          p.project_type,
          p.stage,
          p.tagline,
          p.host_country,
          p.host_region,
          p.host_country_code,
          p.latitude,
          p.longitude,
          p.story,
          p.approach,
          p.methodology_id,
          p.methodology_version,
          p.methodology_notes,
          p.project_methodology_doc_url,
          p.pdd_status,
          p.audit_status,
          p.expected_annual_reductions,
          p.visibility,
          p.owner_user_id,
          p.company_id,

          p.registry_date,
          p.credit_issuance_date,
          p.registration_date_expected,
          p.registration_date_actual,
          p.implementation_start,
          p.implementation_end,
          p.crediting_start,
          p.crediting_end,
          p.inception_date,
          p.completion_date,

          p.registration_platform,
          p.registry_id,
          p.registry_project_url,
          p.tenure_text,
          p.total_area,
          p.total_credits_issued,
          p.annual_estimated_credits,
          p.annual_estimate_unit,
          p.first_vintage_year,

          c.display_name AS company_name
        FROM projects p
        LEFT JOIN companies c
          ON c.id = p.company_id
         AND COALESCE(c.delete_flag, false) = false
        WHERE p.id = $1
          AND COALESCE(p.delete_flag, false) = false
        LIMIT 1
        `,
            [projectId]
        );

        return projectRes.rows[0] ?? null;
    }

    private async buildProjectDetail(
        row: any,
        projectId: string,
        currentUserId: string | null,
        options?: {
            skipVisibilityFilter?: boolean;
        }
    ) {
        const myRole = await this.resolveProjectRole(projectId, row.owner_user_id, currentUserId);

        const [opportunities, updates, team, sectionVisibility, media, documents] = await Promise.all([
            this.loadProjectOpportunities(projectId),
            this.loadProjectUpdates(projectId),
            this.loadProjectTeam(projectId),
            this.loadSectionVisibility(projectId),
            this.loadProjectMedia(projectId),
            this.loadProjectDocuments(projectId),
        ]);

        const detail = {
            id: row.id,
            upid: row.upid ?? null,
            name: row.name,
            stage: row.stage,
            type: row.project_type ?? null,
            description: row.tagline ?? null,
            companyName: row.company_name ?? null,
            country: row.host_country ?? null,
            region: row.host_region ?? null,
            coverImageUrl: media.find((item) => item.isCover)?.assetUrl ?? media[0]?.assetUrl ?? null,

            projectVisibility: row.visibility ?? null,

            storyProblem: row.story ?? null,
            storyApproach: row.approach ?? null,

            methodology: row.methodology_version ?? null,
            methodologyId: row.methodology_id ?? null,
            methodologyNotes: row.methodology_notes ?? null,
            projectMethodologyDocUrl: row.project_methodology_doc_url ?? null,

            registrationPlatform: row.registration_platform ?? null,
            registryStatus: row.pdd_status ?? null,
            auditStatus: row.audit_status ?? null,
            registryId: row.registry_id ?? null,
            registryProjectUrl: row.registry_project_url ?? null,

            registryDate: row.registry_date
                ? new Date(row.registry_date).toISOString().slice(0, 10)
                : null,

            registrationDateExpected: row.registration_date_expected
                ? new Date(row.registration_date_expected).toISOString().slice(0, 10)
                : null,

            registrationDateActual: row.registration_date_actual
                ? new Date(row.registration_date_actual).toISOString().slice(0, 10)
                : null,

            creditIssuanceDate: row.credit_issuance_date
                ? new Date(row.credit_issuance_date).toISOString().slice(0, 10)
                : null,

            implementationStart: row.implementation_start
                ? new Date(row.implementation_start).toISOString().slice(0, 10)
                : null,

            implementationEnd: row.implementation_end
                ? new Date(row.implementation_end).toISOString().slice(0, 10)
                : null,

            creditingStart: row.crediting_start
                ? new Date(row.crediting_start).toISOString().slice(0, 10)
                : null,

            creditingEnd: row.crediting_end
                ? new Date(row.crediting_end).toISOString().slice(0, 10)
                : null,

            inceptionDate: row.inception_date
                ? new Date(row.inception_date).toISOString().slice(0, 10)
                : null,

            completionDate: row.completion_date
                ? new Date(row.completion_date).toISOString().slice(0, 10)
                : null,

            tenureText: row.tenure_text ?? null,

            totalAreaHa:
                row.total_area == null ? null : Number(row.total_area),

            estimatedAnnualRemoval:
                row.expected_annual_reductions == null
                    ? null
                    : JSON.stringify(row.expected_annual_reductions),

            totalCreditsIssued:
                row.total_credits_issued == null ? null : Number(row.total_credits_issued),

            annualEstimatedCredits:
                row.annual_estimated_credits == null ? null : Number(row.annual_estimated_credits),

            annualEstimateUnit: row.annual_estimate_unit ?? null,

            firstVintageYear:
                row.first_vintage_year == null ? null : Number(row.first_vintage_year),

            readiness: [],
            opportunities,
            updates,
            documents,
            media,
            team,

            latitude: row.latitude == null ? null : Number(row.latitude),
            longitude: row.longitude == null ? null : Number(row.longitude),

            sectionVisibility,

            myRole,
            saved: false,
        };

        if (options?.skipVisibilityFilter) {
            return detail;
        }

        return this.applySectionVisibilityToDetail(detail, myRole);
    }

    async getProjectById(projectId: string, currentUserId: string | null) {
        const row = await this.loadProjectBaseRow(projectId);
        if (!row) return null;

        const myRole = await this.resolveProjectRole(projectId, row.owner_user_id, currentUserId);
        const projectVisibility = String(row.visibility ?? "").trim().toLowerCase();

        if (!myRole && projectVisibility !== "public") {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }

        return this.buildProjectDetail(row, projectId, currentUserId);
    }

    async getProjectForEdit(projectId: string, currentUserId: string) {
        const row = await this.loadProjectBaseRow(projectId);
        if (!row) {
            return null;
        }

        const myRole = await this.resolveProjectRole(projectId, row.owner_user_id, currentUserId);

        if (myRole !== "creator") {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }

        return this.buildProjectDetail(row, projectId, currentUserId, {
            skipVisibilityFilter: true,
        });
    }

    async createProject(userId: string, input: CreateProjectInput): Promise<{ id: string }> {
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");


            const projectRes = await client.query<{ id: string }>(
                `
      INSERT INTO projects (
        company_id,
        owner_user_id,
        name,
        tagline,
        project_type,
        stage,
        visibility,
        host_country,
        host_region,
        latitude,
        longitude,
        story,
        approach,
        description
      )
      VALUES (
        $1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      RETURNING id
      `,
                [
                    input.companyId,
                    userId,
                    input.name.trim(),
                    input.tagline.trim(),
                    input.type.trim(),
                    input.stage,
                    input.projectVisibility ?? 'private',
                    input.country.trim(),
                    input.state,
                    input.coordinates?.lat ?? null,
                    input.coordinates?.lng ?? null,
                    input.story.trim(),
                    input.approach.trim(),
                    buildDescription(input),
                ]
            );

            const projectId = projectRes.rows[0]!.id;

            await client.query(
                `
                INSERT INTO project_users (
                project_id,
                member_type,
                member_user_id,
                member_company_id,
                permission,
                role,
                delete_flag,
                created_at,
                updated_at
                )
                VALUES ($1, 'user', $2, NULL, 'creator', 'Owner', false, now(), now())
                `,
                [projectId, userId]
            );

            const sectionKeys: string[] = [
                "overview", "story", "location", "readiness", "registry",
                "impact", "opportunities", "updates", "documents", "media", "team"
            ];

            for (const key of sectionKeys) {
                await client.query(
                    `
        INSERT INTO project_section_privacy (project_id, section_key, visibility)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, section_key) DO UPDATE
        SET visibility = EXCLUDED.visibility,
            updated_at = now()
        `,
                    [projectId, key, input.sectionVisibility?.[key as keyof typeof input.sectionVisibility] ?? "public"]
                );
            }

            if ((input as any).opportunities?.length) {
                await this.replaceProjectOpportunities(
                    projectId,
                    userId,
                    (input as any).opportunities as ProjectOpportunityInput[]
                );
            }

            for (const member of (input.team ?? []) as ProjectTeamMemberInput[]) {
                const memberType = member.memberType === "company" ? "company" : "user";
                const isPlatformMember = member.isPlatformMember !== false;

                const memberUserId =
                    isPlatformMember && memberType === "user"
                        ? (member.userId ?? member.memberId ?? null)
                        : null;

                const memberCompanyId =
                    isPlatformMember && memberType === "company"
                        ? (member.companyId ?? member.memberId ?? null)
                        : null;

                const manualName =
                    !isPlatformMember && memberType === "user"
                        ? (member.manualName ?? member.name ?? null)
                        : !isPlatformMember && memberType === "company"
                            ? (member.manualName ?? member.name ?? null)
                            : null;

                const manualOrganization =
                    !isPlatformMember && memberType === "company"
                        ? (member.manualOrganization ?? member.companyName ?? member.name ?? null)
                        : !isPlatformMember && memberType === "user"
                            ? (member.manualOrganization ?? member.companyName ?? null)
                            : null;

                if (isPlatformMember && memberType === "user" && memberUserId === userId) continue;
                if (isPlatformMember && !memberUserId && !memberCompanyId) continue;
                if (!isPlatformMember && !(manualName || manualOrganization)) continue;

                await client.query(
                    `
        INSERT INTO project_users (
            project_id,
            member_type,
                    member_user_id,
                    member_company_id,
                    is_platform_member,
                    manual_name,
                    manual_organization,
                    permission,
                    role,
                    delete_flag,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, NULLIF($9, ''), false, now(), now())
                `,
                    [
                        projectId,
                        memberType,
                        memberUserId,
                        memberCompanyId,
                        isPlatformMember,
                        manualName,
                        manualOrganization,
                        memberType === "company" ? null : (member.permission ?? "viewer"),
                        member.role ?? null,
                    ]
                );
            }

            await client.query("COMMIT");
            return { id: projectId };
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    private normalizeProjectOpportunityInput(
        input: CreateProjectOpportunityInput | UpdateProjectOpportunityInput
    ) {
        return {
            type:
                typeof input.type === "string"
                    ? input.type.trim()
                    : undefined,
            description:
                input.description === undefined
                    ? undefined
                    : (input.description?.trim() || null),
            urgent:
                input.urgent === undefined
                    ? undefined
                    : Boolean(input.urgent),
            isActive:
                input.isActive === undefined
                    ? undefined
                    : Boolean(input.isActive),
        };
    }

    private mapProjectOpportunity(row: {
        id: string;
        project_id: string;
        opportunity_type: string;
        description: string | null;
        is_priority: boolean;
        sort_order: number;
        is_active: boolean;
    }) {
        return {
            id: row.id,
            projectId: row.project_id,
            type: row.opportunity_type,
            description: row.description ?? null,
            urgent: Boolean(row.is_priority),
            sortOrder: Number(row.sort_order ?? 0),
            isActive: Boolean(row.is_active),
        };
    }

    private buildProjectListOrderBy(
        sortBy: NonNullable<ListProjectsInput["sortBy"]>,
        sortDir: NonNullable<ListProjectsInput["sortDir"]>
    ): string {
        const dir = sortDir === "asc" ? "ASC" : "DESC";

        switch (sortBy) {
            case "name":
                return `name ${dir} NULLS LAST, updated_at DESC`;
            case "developer":
                return `developer_name ${dir} NULLS LAST, name ASC`;
            case "stage":
                return `stage ${dir} NULLS LAST, name ASC`;
            case "type":
                return `project_type ${dir} NULLS LAST, name ASC`;
            case "country":
                return `host_country ${dir} NULLS LAST, name ASC`;
            case "updated":
            default:
                return `updated_at ${dir} NULLS LAST, name ASC`;
        }
    }

    async listProjects(input: ListProjectsInput): Promise<ListProjectsResult> {
        const page = Math.max(input.page ?? 1, 1);
        const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
        const offset = (page - 1) * pageSize;

        const scope: ProjectListScope = input.scope ?? "all";
        const sortBy = input.sortBy ?? "updated";
        const sortDir = input.sortDir === "asc" ? "asc" : "desc";

        const q = input.q?.trim() || null;
        const stages = (input.stage ?? []).map((v) => v.trim()).filter(Boolean);
        const projectTypes = (input.projectType ?? []).map((v) => v.trim()).filter(Boolean);
        const hostCountries = (input.hostCountry ?? []).map((v) => v.trim()).filter(Boolean);
        const opportunities = (input.opportunity ?? []).map((v) => v.trim()).filter(Boolean);

        const values: unknown[] = [];
        let idx = 1;

        const push = (value: unknown) => {
            values.push(value);
            return `$${idx++}`;
        };

        const userIdParam = push(input.userId ?? null);
        const qParam = push(q);
        const stagesParam = push(stages);
        const typesParam = push(projectTypes);
        const countriesParam = push(hostCountries);
        const opportunitiesParam = push(opportunities);
        const limitParam = push(pageSize);
        const offsetParam = push(offset);

        const orderBySql = this.buildProjectListOrderBy(sortBy, sortDir);

        const sql = `
        WITH saved_projects AS (
            SELECT usi.entity_id AS project_id
            FROM user_saved_items usi
            WHERE usi.user_id = ${userIdParam}
            AND usi.entity_type = 'project'
        ),
        project_memberships AS (
            SELECT DISTINCT pu.project_id
            FROM project_users pu
            WHERE pu.member_type = 'user'
            AND pu.member_user_id = ${userIdParam}
            AND COALESCE(pu.delete_flag, false) = false
            AND pu.permission IN ('creator', 'viewer')
        ),
    base_projects AS (
        SELECT
        p.id,
        p.upid,
        p.name,
        p.description,
        p.stage,
        p.project_type,
        p.host_country,
        p.host_country_code,
        p.host_region,
        CASE WHEN p.latitude IS NULL THEN NULL ELSE p.latitude::float END AS lat,
        CASE WHEN p.longitude IS NULL THEN NULL ELSE p.longitude::float END AS lng,
        p.updated_at,
        p.owner_user_id,
        p.company_id,
        p.visibility,
        c.display_name AS developer_name,
        (sp.project_id IS NOT NULL) AS is_saved,
        (p.owner_user_id = ${userIdParam}) AS is_mine,

        cover_pm.asset_url AS cover_image_url,
        thumb_pm.asset_url AS cover_thumb_url

        FROM projects p
        LEFT JOIN companies c
            ON c.id = p.company_id
        AND COALESCE(c.delete_flag, false) = false
        LEFT JOIN saved_projects sp
            ON sp.project_id = p.id
        LEFT JOIN project_memberships pm
            ON pm.project_id = p.id

        LEFT JOIN LATERAL (
            SELECT pm1.id, pm1.asset_url
            FROM project_media pm1
            WHERE pm1.project_id = p.id
            AND COALESCE(pm1.is_system_generated, false) = false
            ORDER BY
            COALESCE(pm1.is_cover, false) DESC,
            pm1.created_at ASC
            LIMIT 1
        ) cover_pm ON TRUE

        LEFT JOIN LATERAL (
            SELECT pm2.asset_url
            FROM project_media pm2
            WHERE pm2.source_media_id = cover_pm.id
            AND pm2.variant = 'logo'
            AND COALESCE(pm2.is_system_generated, false) = true
            ORDER BY pm2.created_at DESC
            LIMIT 1
        ) thumb_pm ON TRUE

        WHERE COALESCE(p.delete_flag, false) = false
        AND (
            LOWER(COALESCE(p.visibility, 'private')) = 'public'
            OR pm.project_id IS NOT NULL
            OR p.owner_user_id = ${userIdParam}
        )
        AND (
            NULLIF(${qParam}::text, '') IS NULL
            OR COALESCE(NULLIF(TRIM(p.name), ''), '') ILIKE '%' || ${qParam}::text || '%'
        )
    ),
base_with_opps AS (
    SELECT
        bp.*,
        COALESCE(
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT po.opportunity_type), NULL),
            ARRAY[]::text[]
        ) AS opportunities
    FROM base_projects bp
    LEFT JOIN project_opportunities po
        ON po.project_id = bp.id
       AND COALESCE(po.delete_flag, false) = false
       AND COALESCE(po.is_active, true) = true
    GROUP BY
        bp.id,
        bp.upid,
        bp.name,
        bp.description,
        bp.stage,
        bp.project_type,
        bp.host_country,
        bp.host_country_code,
        bp.host_region,
        bp.lat,
        bp.lng,
        bp.updated_at,
        bp.owner_user_id,
        bp.company_id,
        bp.developer_name,
        bp.is_saved,
        bp.is_mine,
        bp.visibility,
        bp.cover_image_url,
        bp.cover_thumb_url
),
scoped_projects AS (
    SELECT *
    FROM base_with_opps bwo
    WHERE (
        ${scope === "all" ? "TRUE" : "FALSE"}
        OR (${scope === "my" ? "TRUE" : "FALSE"} AND bwo.owner_user_id = ${userIdParam})
        OR (
            ${scope === "saved" ? "TRUE" : "FALSE"}
            AND bwo.is_saved = true
        )
    )
),
filtered_projects AS (
    SELECT *
    FROM scoped_projects bwo
    WHERE (
        cardinality(${stagesParam}::text[]) = 0
        OR bwo.stage = ANY(${stagesParam}::text[])
    )
      AND (
        cardinality(${typesParam}::text[]) = 0
        OR bwo.project_type = ANY(${typesParam}::text[])
    )
      AND (
        cardinality(${countriesParam}::text[]) = 0
        OR bwo.host_country = ANY(${countriesParam}::text[])
    )
      AND (
        cardinality(${opportunitiesParam}::text[]) = 0
        OR bwo.opportunities && ${opportunitiesParam}::text[]
    )
),
paged_projects AS (
    SELECT *
    FROM filtered_projects
    ORDER BY ${orderBySql}
    LIMIT ${limitParam}
    OFFSET ${offsetParam}
),

stage_facet_source AS (
    SELECT *
    FROM scoped_projects bwo
    WHERE (
        cardinality(${typesParam}::text[]) = 0
        OR bwo.project_type = ANY(${typesParam}::text[])
    )
      AND (
        cardinality(${countriesParam}::text[]) = 0
        OR bwo.host_country = ANY(${countriesParam}::text[])
    )
      AND (
        cardinality(${opportunitiesParam}::text[]) = 0
        OR bwo.opportunities && ${opportunitiesParam}::text[]
    )
),
type_facet_source AS (
    SELECT *
    FROM scoped_projects bwo
    WHERE (
        cardinality(${stagesParam}::text[]) = 0
        OR bwo.stage = ANY(${stagesParam}::text[])
    )
      AND (
        cardinality(${countriesParam}::text[]) = 0
        OR bwo.host_country = ANY(${countriesParam}::text[])
    )
      AND (
        cardinality(${opportunitiesParam}::text[]) = 0
        OR bwo.opportunities && ${opportunitiesParam}::text[]
    )
),
country_facet_source AS (
    SELECT *
    FROM scoped_projects bwo
    WHERE (
        cardinality(${stagesParam}::text[]) = 0
        OR bwo.stage = ANY(${stagesParam}::text[])
    )
      AND (
        cardinality(${typesParam}::text[]) = 0
        OR bwo.project_type = ANY(${typesParam}::text[])
    )
      AND (
        cardinality(${opportunitiesParam}::text[]) = 0
        OR bwo.opportunities && ${opportunitiesParam}::text[]
    )
),
opportunity_facet_source AS (
    SELECT *
    FROM scoped_projects bwo
    WHERE (
        cardinality(${stagesParam}::text[]) = 0
        OR bwo.stage = ANY(${stagesParam}::text[])
    )
      AND (
        cardinality(${typesParam}::text[]) = 0
        OR bwo.project_type = ANY(${typesParam}::text[])
    )
      AND (
        cardinality(${countriesParam}::text[]) = 0
        OR bwo.host_country = ANY(${countriesParam}::text[])
    )
),

stage_facets AS (
    SELECT sfs.stage AS value, COUNT(*)::int AS count
    FROM stage_facet_source sfs
    WHERE sfs.stage IS NOT NULL
      AND sfs.stage <> ''
    GROUP BY sfs.stage
),
type_facets AS (
    SELECT tfs.project_type AS value, COUNT(*)::int AS count
    FROM type_facet_source tfs
    WHERE tfs.project_type IS NOT NULL
      AND tfs.project_type <> ''
    GROUP BY tfs.project_type
),
country_facets AS (
    SELECT cfs.host_country AS value, COUNT(*)::int AS count
    FROM country_facet_source cfs
    WHERE cfs.host_country IS NOT NULL
      AND cfs.host_country <> ''
    GROUP BY cfs.host_country
),
opportunity_facets AS (
    SELECT po.value, COUNT(*)::int AS count
    FROM opportunity_facet_source ofs
    CROSS JOIN LATERAL unnest(ofs.opportunities) AS po(value)
    WHERE po.value IS NOT NULL
      AND po.value <> ''
    GROUP BY po.value
),

total_count AS (
    SELECT COUNT(*)::int AS total
    FROM filtered_projects
),
all_count AS (
    SELECT COUNT(*)::int AS count
    FROM base_with_opps
),
my_count AS (
    SELECT COUNT(*)::int AS count
    FROM base_with_opps
    WHERE owner_user_id = ${userIdParam}
),
saved_count AS (
    SELECT COUNT(*)::int AS count
    FROM base_with_opps
    WHERE is_saved = true
)
SELECT json_build_object(
    'items',
    COALESCE((
        SELECT json_agg(
            json_build_object(
                'id', pp.id,
                'upid', pp.upid,
                'name', pp.name,
                'developer', COALESCE(pp.developer_name, ''),
                'description', pp.description,
                'stage', pp.stage,
                'type', pp.project_type,
                'country', pp.host_country,
                'countryCode', pp.host_country_code,
                'region', pp.host_region,
                'lat', pp.lat,
                'lng', pp.lng,
                'updatedAt', pp.updated_at,
                'opportunities', pp.opportunities,
                'isSaved', pp.is_saved,
                'isMine', pp.is_mine,
                'visibility', pp.visibility,
                'coverImageUrl', pp.cover_image_url,
                'coverThumbUrl', pp.cover_thumb_url
            )
            ORDER BY ${orderBySql}
        )
        FROM paged_projects pp
    ), '[]'::json),
    'total', (SELECT total FROM total_count),
    'page', ${page},
    'pageSize', ${pageSize},
    'sortBy', '${sortBy}',
    'sortDir', '${sortDir}',
    'counts', json_build_object(
        'all', (SELECT count FROM all_count),
        'my', (SELECT count FROM my_count),
        'saved', (SELECT count FROM saved_count)
    ),
    'filters', json_build_object(
        'stages', COALESCE((
            SELECT json_agg(
                json_build_object('value', sf.value, 'count', sf.count)
                ORDER BY sf.value
            )
            FROM stage_facets sf
        ), '[]'::json),
        'types', COALESCE((
            SELECT json_agg(
                json_build_object('value', tf.value, 'count', tf.count)
                ORDER BY tf.value
            )
            FROM type_facets tf
        ), '[]'::json),
        'countries', COALESCE((
            SELECT json_agg(
                json_build_object('value', cf.value, 'count', cf.count)
                ORDER BY cf.value
            )
            FROM country_facets cf
        ), '[]'::json),
        'opportunities', COALESCE((
            SELECT json_agg(
                json_build_object('value', ofa.value, 'count', ofa.count)
                ORDER BY ofa.value
            )
            FROM opportunity_facets ofa
        ), '[]'::json)
    )
) AS result
`;
        const result = await this.db.query<{ result: ListProjectsResult }>(sql, values);
        const row = result.rows[0]?.result;

        if (!row) {
            return {
                items: [],
                total: 0,
                page,
                pageSize,
                sortBy,
                sortDir,
                counts: {
                    all: 0,
                    my: 0,
                    saved: 0,
                },
                filters: {
                    stages: [],
                    types: [],
                    countries: [],
                    opportunities: [],
                },
            };
        }

        return {
            ...row,
            items: (row.items ?? []).map((item) => ({
                ...item,
                coverImageUrl: toPublicAssetUrl({
                    asset_url: item.coverImageUrl,
                    s3_key: null,
                }),
                coverThumbUrl: toPublicAssetUrl({
                    asset_url: item.coverThumbUrl,
                    s3_key: null,
                }),
            })),
        };
    }

    private async replaceProjectUpdates(
        projectId: string,
        currentUserId: string,
        updates: ProjectUpdateInput[]
    ) {
        await this.db.query(
            `
        UPDATE project_updates
        SET delete_flag = true,
            deleted_at = now(),
            updated_at = now(),
            updated_by = $2
        WHERE project_id = $1
          AND COALESCE(delete_flag, false) = false
        `,
            [projectId, currentUserId]
        );

        const cleaned = updates
            .map((item) => ({
                title: item.title?.trim() ?? "",
                description: item.description?.trim() ?? null,
                dateLabel: item.dateLabel?.trim() ?? null,
                authorName: item.authorName?.trim() ?? null,
                type: item.type === "stage" ? "stage" : "progress",
            }))
            .filter((item) => item.title);

        for (let index = 0; index < cleaned.length; index += 1) {
            const item = cleaned[index];
            if (!item) continue;

            const parsedDate =
                item.dateLabel && /^\d{4}-\d{2}-\d{2}$/.test(item.dateLabel)
                    ? item.dateLabel
                    : null;

            await this.db.query(
                `
            INSERT INTO project_updates (
                project_id,
                title,
                description,
                update_date,
                author_name,
                update_type,
                sort_order,
                is_active,
                created_by,
                updated_by,
                created_at,
                updated_at,
                delete_flag
            )
            VALUES (
                $1, $2, NULLIF($3, ''), $4, NULLIF($5, ''), $6, $7, true, $8, $8, now(), now(), false
            )
            `,
                [
                    projectId,
                    item.title,
                    item.description,
                    parsedDate,
                    item.authorName,
                    item.type,
                    index,
                    currentUserId,
                ]
            );
        }
    }

    private async loadProjectUpdates(projectId: string) {
        const res = await this.db.query(
            `
        SELECT
            id,
            title,
            description,
            update_date,
            author_name,
            update_type
        FROM project_updates
        WHERE project_id = $1
          AND COALESCE(delete_flag, false) = false
          AND COALESCE(is_active, true) = true
        ORDER BY
            sort_order ASC,
            update_date DESC NULLS LAST,
            created_at DESC
        `,
            [projectId]
        );

        return res.rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description ?? null,
            dateLabel: row.update_date
                ? new Date(row.update_date).toISOString().slice(0, 10)
                : null,
            authorName: row.author_name ?? null,
            type: row.update_type === "stage" ? "stage" : "progress",
        }));
    }

    async updateProject(projectId: string, currentUserId: string, patch: UpdateProjectBody) {
        const existing = await this.db.query(
            `
      SELECT id, owner_user_id
      FROM projects
      WHERE id = $1
        AND COALESCE(delete_flag, false) = false
      LIMIT 1
      `,
            [projectId]
        );

        const row = existing.rows[0];
        if (!row) {
            return null;
        }

        if (row.owner_user_id !== currentUserId) {
            const err = new Error('Forbidden');
            (err as any).statusCode = 403;
            throw err;
        }

        await this.db.query('BEGIN');

        try {
            await this.updateProjectCore(projectId, patch);

            if (patch.sectionVisibility) {
                await this.upsertSectionVisibility(projectId, patch.sectionVisibility);
            }

            if (patch.opportunities !== undefined) {
                await this.replaceProjectOpportunities(
                    projectId,
                    currentUserId,
                    patch.opportunities
                );
            }

            if (patch.team !== undefined) {
                const normalizedTeam: ProjectTeamMemberInput[] = patch.team.map((member) => {
                    const memberType = member.memberType === "company" ? "company" : "user";
                    const isPlatformMember = member.isPlatformMember !== false;

                    if (memberType === "company") {
                        return {
                            memberType: "company",
                            memberId: member.memberId ?? member.companyId ?? null,
                            companyId: isPlatformMember
                                ? (member.companyId ?? member.memberId ?? null)
                                : null,
                            userId: null,
                            role: member.role ?? null,
                            permission: null,
                            isPlatformMember,
                            manualName:
                                !isPlatformMember
                                    ? (member.manualName ?? member.name ?? null)
                                    : null,
                            manualOrganization:
                                !isPlatformMember
                                    ? (member.manualOrganization ?? member.companyName ?? member.name ?? null)
                                    : null,
                            name: member.name ?? null,
                            companyName: member.companyName ?? null,
                        };
                    }

                    return {
                        memberType: "user",
                        memberId: member.memberId ?? member.userId ?? null,
                        userId: isPlatformMember
                            ? (member.userId ?? member.memberId ?? null)
                            : null,
                        companyId: null,
                        role: member.role ?? null,
                        permission: member.permission ?? "viewer",
                        isPlatformMember,
                        manualName:
                            !isPlatformMember
                                ? (member.manualName ?? member.name ?? null)
                                : null,
                        manualOrganization:
                            !isPlatformMember
                                ? (member.manualOrganization ?? member.companyName ?? null)
                                : null,
                        name: member.name ?? null,
                        companyName: member.companyName ?? null,
                    };
                });

                await this.replaceProjectTeam(projectId, currentUserId, normalizedTeam);
            }

            if (patch.updates) {
                await this.replaceProjectUpdates(projectId, currentUserId, patch.updates);
            }

            // if (patch.documents) {
            //     await this.replaceProjectDocuments(projectId, currentUserId, patch.documents);
            // }

            // if (patch.media || patch.coverImageUrl !== undefined) {
            //     await this.replaceProjectMedia(projectId, currentUserId, patch.media ?? [], patch.coverImageUrl);
            // }

            await this.db.query('COMMIT');
        } catch (err) {
            await this.db.query('ROLLBACK');
            throw err;
        }

        return this.getProjectById(projectId, currentUserId);
    }

    private async resolveProjectRole(
        projectId: string,
        ownerUserId: string,
        currentUserId: string | null
    ): Promise<ProjectRole> {
        if (!currentUserId) return null;
        if (ownerUserId === currentUserId) return "creator";

        const res = await this.db.query(
            `
        SELECT permission
        FROM project_users
        WHERE project_id = $1
          AND member_type = 'user'
          AND member_user_id = $2
          AND COALESCE(delete_flag, false) = false
        LIMIT 1
        `,
            [projectId, currentUserId]
        );

        const row = res.rows[0];
        if (!row) return null;

        return row.permission === "creator" ? "creator" : "viewer";
    }

    private async loadProjectOpportunities(projectId: string) {
        const res = await this.db.query(
            `
      SELECT id, opportunity_type, description, is_priority
      FROM project_opportunities
      WHERE project_id = $1
        AND COALESCE(delete_flag, false) = false
        AND COALESCE(is_active, true) = true
      ORDER BY sort_order ASC, created_at ASC
      `,
            [projectId]
        );

        return res.rows.map((row) => ({
            id: row.id,
            type: row.opportunity_type,
            description: row.description ?? null,
            urgent: Boolean(row.is_priority),
        }));
    }

    private async loadProjectTeam(projectId: string) {
        const res = await this.db.query<ProjectTeamMemberRow>(
            `
        SELECT
          pu.id,
          pu.member_type,
          pu.member_user_id,
          pu.member_company_id,
          pu.is_platform_member,
          pu.manual_name,
          pu.manual_organization,
          pu.role,
          pu.permission,

          CASE
            WHEN COALESCE(pu.is_platform_member, true) = false AND pu.member_type = 'company' THEN
              COALESCE(
                NULLIF(TRIM(pu.manual_name), ''),
                NULLIF(TRIM(pu.manual_organization), ''),
                pu.id::text
              )
            WHEN COALESCE(pu.is_platform_member, true) = false AND pu.member_type = 'user' THEN
              COALESCE(
                NULLIF(TRIM(pu.manual_name), ''),
                pu.id::text
              )
            WHEN pu.member_type = 'company' THEN
              COALESCE(NULLIF(TRIM(c.display_name), ''), pu.member_company_id::text)
            ELSE
              COALESCE(
                NULLIF(TRIM(up.full_name), ''),
                NULLIF(TRIM(un.name), ''),
                NULLIF(TRIM(un.email), ''),
                pu.member_user_id::text
              )
          END AS display_name,

          CASE
            WHEN COALESCE(pu.is_platform_member, true) = true
             AND pu.member_type = 'user' THEN un.email
            ELSE NULL
          END AS email,

          CASE
            WHEN COALESCE(pu.is_platform_member, true) = false
             AND pu.member_type = 'company' THEN
              COALESCE(NULLIF(TRIM(pu.manual_organization), ''), NULLIF(TRIM(pu.manual_name), ''))
            WHEN COALESCE(pu.is_platform_member, true) = false
             AND pu.member_type = 'user' THEN
              NULLIF(TRIM(pu.manual_organization), '')
            WHEN pu.member_type = 'user' THEN owner_c.display_name
            ELSE c.display_name
          END AS company_name

        FROM project_users pu
        LEFT JOIN users_new un
          ON COALESCE(pu.is_platform_member, true) = true
         AND pu.member_type = 'user'
         AND un.id = pu.member_user_id
        LEFT JOIN user_profiles up
          ON COALESCE(pu.is_platform_member, true) = true
         AND pu.member_type = 'user'
         AND up.user_id = pu.member_user_id
        LEFT JOIN companies c
          ON COALESCE(pu.is_platform_member, true) = true
         AND pu.member_type = 'company'
         AND c.id = pu.member_company_id
         AND COALESCE(c.delete_flag, false) = false
        LEFT JOIN companies owner_c
          ON COALESCE(pu.is_platform_member, true) = true
         AND pu.member_type = 'user'
         AND owner_c.id = (
            SELECT c2.id
            FROM companies c2
            WHERE c2.owner_user_id = pu.member_user_id
              AND COALESCE(c2.delete_flag, false) = false
            ORDER BY c2.created_at ASC
            LIMIT 1
         )
        WHERE pu.project_id = $1
          AND COALESCE(pu.delete_flag, false) = false
        ORDER BY
          CASE pu.permission WHEN 'creator' THEN 0 ELSE 1 END,
          CASE pu.member_type WHEN 'company' THEN 0 ELSE 1 END,
          COALESCE(NULLIF(TRIM(pu.role), ''), 'zzz'),
          display_name
        `,
            [projectId]
        );

        return res.rows.map((row) => {
            const memberType = row.member_type === "company" ? "company" : "user";
            const userId = row.member_user_id ?? null;
            const companyId = row.member_company_id ?? null;
            const isPlatformMember = row.is_platform_member !== false;

            return {
                id: row.id,
                memberType,
                memberId:
                    memberType === "company"
                        ? (companyId ?? row.id)
                        : (userId ?? row.id),
                userId,
                companyId,
                name: row.display_name,
                role: row.role ?? "",
                companyName: row.company_name ?? "",
                avatarUrl: null,
                permission:
                    memberType === "company"
                        ? undefined
                        : row.permission === "creator"
                            ? "creator"
                            : "viewer",
                isPlatformMember,
                manualName: row.manual_name ?? null,
                manualOrganization: row.manual_organization ?? null,
            };
        });
    }
    private async loadSectionVisibility(projectId: string) {
        const res = await this.db.query(
            `
      SELECT section_key, visibility
      FROM project_section_privacy
      WHERE project_id = $1
      `,
            [projectId]
        );

        const map: Partial<Record<ProjectSectionKey, SectionVisibility>> = {};
        for (const row of res.rows) {
            if (ALL_SECTION_KEYS.includes(row.section_key)) {
                map[row.section_key as ProjectSectionKey] = row.visibility;
            }
        }
        return map;
    }

    private async updateProjectCore(projectId: string, patch: UpdateProjectBody) {
        const updates: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        const set = (column: string, value: unknown) => {
            updates.push(`${column} = $${i++}`);
            values.push(value);
        };

        const toNullableDate = (value: string | null | undefined) => {
            if (value === undefined) return undefined;
            if (value === null) return null;
            const trimmed = value.trim();
            return trimmed ? trimmed : null;
        };

        if (patch.description !== undefined) set("tagline", patch.description);
        if (patch.latitude !== undefined) set("latitude", patch.latitude);
        if (patch.longitude !== undefined) set("longitude", patch.longitude);

        if (patch.name !== undefined) set("name", patch.name);
        if (patch.stage !== undefined) set("stage", patch.stage);
        if (patch.type !== undefined) set("project_type", patch.type);
        if (patch.projectVisibility !== undefined) set("visibility", patch.projectVisibility);
        if (patch.country !== undefined) set("host_country", patch.country);
        if (patch.region !== undefined) set("host_region", patch.region);

        if (patch.storyProblem !== undefined) set("story", patch.storyProblem);
        if (patch.storyApproach !== undefined) set("approach", patch.storyApproach);

        if (patch.methodology !== undefined) set("methodology_version", patch.methodology);
        if (patch.methodologyId !== undefined) set("methodology_id", patch.methodologyId);
        if (patch.methodologyNotes !== undefined) set("methodology_notes", patch.methodologyNotes);
        if (patch.projectMethodologyDocUrl !== undefined) {
            set("project_methodology_doc_url", patch.projectMethodologyDocUrl);
        }

        if (patch.registryStatus !== undefined) set("pdd_status", patch.registryStatus);
        if (patch.auditStatus !== undefined) set("audit_status", patch.auditStatus);

        if (patch.registrationPlatform !== undefined) {
            set("registration_platform", patch.registrationPlatform);
        }

        if (patch.registryId !== undefined) {
            set("registry_id", patch.registryId);
        }

        if (patch.registryProjectUrl !== undefined) {
            set("registry_project_url", patch.registryProjectUrl);
        }

        if (patch.registryDate !== undefined) {
            set("registry_date", toNullableDate(patch.registryDate));
        }

        if (patch.registrationDateExpected !== undefined) {
            set("registration_date_expected", toNullableDate(patch.registrationDateExpected));
        }

        if (patch.registrationDateActual !== undefined) {
            set("registration_date_actual", toNullableDate(patch.registrationDateActual));
        }

        if (patch.creditIssuanceDate !== undefined) {
            set("credit_issuance_date", toNullableDate(patch.creditIssuanceDate));
        }

        if (patch.implementationStart !== undefined) {
            set("implementation_start", toNullableDate(patch.implementationStart));
        }

        if (patch.implementationEnd !== undefined) {
            set("implementation_end", toNullableDate(patch.implementationEnd));
        }

        if (patch.creditingStart !== undefined) {
            set("crediting_start", toNullableDate(patch.creditingStart));
        }

        if (patch.creditingEnd !== undefined) {
            set("crediting_end", toNullableDate(patch.creditingEnd));
        }

        if (patch.inceptionDate !== undefined) {
            set("inception_date", toNullableDate(patch.inceptionDate));
        }

        if (patch.completionDate !== undefined) {
            set("completion_date", toNullableDate(patch.completionDate));
        }

        if (patch.tenureText !== undefined) {
            set("tenure_text", patch.tenureText);
        }

        if (patch.totalAreaHa !== undefined) {
            set("total_area", patch.totalAreaHa);
        }

        if (patch.totalCreditsIssued !== undefined) {
            set("total_credits_issued", patch.totalCreditsIssued);
        }

        if (patch.annualEstimatedCredits !== undefined) {
            set("annual_estimated_credits", patch.annualEstimatedCredits);
        }

        if (patch.annualEstimateUnit !== undefined) {
            set("annual_estimate_unit", patch.annualEstimateUnit);
        }

        if (patch.firstVintageYear !== undefined) {
            set("first_vintage_year", patch.firstVintageYear);
        }

        if (patch.estimatedAnnualRemoval !== undefined) {
            set(
                "expected_annual_reductions",
                patch.estimatedAnnualRemoval
                    ? JSON.stringify({ value: patch.estimatedAnnualRemoval })
                    : null
            );
        }

        if (!updates.length) return;

        updates.push(`updated_at = now()`);
        values.push(projectId);

        await this.db.query(
            `
        UPDATE projects
        SET ${updates.join(", ")}
        WHERE id = $${i}
        `,
            values
        );
    }

    private async upsertSectionVisibility(
        projectId: string,
        visibilityMap: Partial<Record<ProjectSectionKey, SectionVisibility | undefined>>
    ) {
        for (const [sectionKey, visibility] of Object.entries(visibilityMap) as Array<
            [ProjectSectionKey, SectionVisibility | undefined]
        >) {
            if (visibility === undefined) continue;

            await this.db.query(
                `
            INSERT INTO project_section_privacy (project_id, section_key, visibility, created_at, updated_at)
            VALUES ($1, $2, $3, now(), now())
            ON CONFLICT (project_id, section_key)
            DO UPDATE SET
              visibility = EXCLUDED.visibility,
              updated_at = now()
            `,
                [projectId, sectionKey, visibility]
            );
        }
    }

    private async replaceProjectOpportunities(
        projectId: string,
        currentUserId: string,
        opportunities: ProjectOpportunityInput[]
    ) {
        const existingRes = await this.db.query<{
            id: string;
            project_id: string;
        }>(
            `
            SELECT id, project_id
            FROM project_opportunities
            WHERE project_id = $1
              AND COALESCE(delete_flag, false) = false
            `,
            [projectId]
        );

        const existingById = new Map(existingRes.rows.map((row) => [row.id, row]));
        const seenIds = new Set<string>();

        const cleaned = opportunities
            .map((item) => ({
                id: item.id?.trim() || undefined,
                type: item.type?.trim() ?? "",
                description: item.description?.trim() ?? null,
                urgent: Boolean(item.urgent),
            }))
            .filter((item) => item.type);

        for (let index = 0; index < cleaned.length; index += 1) {
            const item = cleaned[index];
            if (!item) continue;

            if (item.id && existingById.has(item.id)) {
                seenIds.add(item.id);

                await this.db.query(
                    `
                    UPDATE project_opportunities
                    SET
                        opportunity_type = $2,
                        description = $3,
                        is_priority = $4,
                        sort_order = $5,
                        is_active = true,
                        updated_by = $6,
                        updated_at = now(),
                        delete_flag = false,
                        deleted_at = NULL
                    WHERE id = $1
                      AND project_id = $7
                    `,
                    [
                        item.id,
                        item.type,
                        item.description,
                        item.urgent,
                        index,
                        currentUserId,
                        projectId,
                    ]
                );

                continue;
            }

            const insertRes = await this.db.query<{ id: string }>(
                `
                INSERT INTO project_opportunities (
                    project_id,
                    opportunity_type,
                    description,
                    is_priority,
                    sort_order,
                    is_active,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at,
                    delete_flag
                )
                VALUES ($1, $2, $3, $4, $5, true, $6, $6, now(), now(), false)
                RETURNING id
                `,
                [
                    projectId,
                    item.type,
                    item.description,
                    item.urgent,
                    index,
                    currentUserId,
                ]
            );

            const insertedId = insertRes.rows[0]?.id;
            if (insertedId) {
                seenIds.add(insertedId);
            }
        }

        const idsToDelete = existingRes.rows
            .map((row) => row.id)
            .filter((id) => !seenIds.has(id));

        if (idsToDelete.length > 0) {
            await this.db.query(
                `
                UPDATE project_opportunities
                SET
                    delete_flag = true,
                    deleted_at = now(),
                    updated_at = now(),
                    updated_by = $2
                WHERE project_id = $1
                  AND id = ANY($3::uuid[])
                  AND COALESCE(delete_flag, false) = false
                `,
                [projectId, currentUserId, idsToDelete]
            );
        }
    }

    private async replaceProjectTeam(
        projectId: string,
        currentUserId: string,
        team: ProjectTeamMemberInput[]
    ) {
        await this.db.query(
            `
        UPDATE project_users
        SET delete_flag = true,
            updated_at = now()
        WHERE project_id = $1
          AND permission <> 'creator'
          AND COALESCE(delete_flag, false) = false
        `,
            [projectId]
        );

        for (const member of team) {
            const memberType = member.memberType === "company" ? "company" : "user";
            const isPlatformMember = member.isPlatformMember !== false;

            const memberUserId =
                isPlatformMember && memberType === "user"
                    ? (member.userId ?? member.memberId ?? null)
                    : null;

            const memberCompanyId =
                isPlatformMember && memberType === "company"
                    ? (member.companyId ?? member.memberId ?? null)
                    : null;

            const manualName =
                !isPlatformMember && memberType === "user"
                    ? (member.manualName ?? member.name ?? null)
                    : !isPlatformMember && memberType === "company"
                        ? (member.manualName ?? member.name ?? null)
                        : null;

            const manualOrganization =
                !isPlatformMember && memberType === "company"
                    ? (member.manualOrganization ?? member.companyName ?? member.name ?? null)
                    : !isPlatformMember && memberType === "user"
                        ? (member.manualOrganization ?? member.companyName ?? null)
                        : null;

            if (isPlatformMember && memberType === "user" && memberUserId === currentUserId) continue;
            if (isPlatformMember && !memberUserId && !memberCompanyId) continue;
            if (!isPlatformMember && !(manualName || manualOrganization)) continue;

            const permissionValue =
                memberType === "company"
                    ? null
                    : (member.permission ?? "viewer");

            if (isPlatformMember) {
                const existing = await this.db.query<{ id: string }>(
                    `
                SELECT id
                FROM project_users
                WHERE project_id = $1
                  AND member_type = $2
                  AND COALESCE(is_platform_member, true) = true
                  AND (
                    ($2 = 'user' AND member_user_id = $3)
                    OR
                    ($2 = 'company' AND member_company_id = $4)
                  )
                LIMIT 1
                `,
                    [projectId, memberType, memberUserId, memberCompanyId]
                );

                if (existing.rows[0]?.id) {
                    await this.db.query(
                        `
                    UPDATE project_users
                    SET
                        member_user_id = $2,
                        member_company_id = $3,
                        is_platform_member = true,
                        manual_name = NULL,
                        manual_organization = NULL,
                        permission = $4,
                        role = NULLIF($5, ''),
                        delete_flag = false,
                        updated_at = now()
                    WHERE id = $1
                    `,
                        [
                            existing.rows[0].id,
                            memberUserId,
                            memberCompanyId,
                            permissionValue,
                            member.role ?? null,
                        ]
                    );
                    continue;
                }
            }

            await this.db.query(
                `
            INSERT INTO project_users (
                project_id,
                member_type,
                member_user_id,
                member_company_id,
                is_platform_member,
                manual_name,
                manual_organization,
                permission,
                role,
                delete_flag,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, NULLIF($9, ''), false, now(), now())
            `,
                [
                    projectId,
                    memberType,
                    memberUserId,
                    memberCompanyId,
                    isPlatformMember,
                    manualName,
                    manualOrganization,
                    permissionValue,
                    member.role ?? null,
                ]
            );
        }
    }

    private async loadProjectMedia(projectId: string): Promise<ProjectDetailMediaItem[]> {
        const res = await this.db.query(
            `
        SELECT
            pm.id,
            COALESCE(pm.kind, 'image') AS kind,
            pm.asset_url,
            pm.s3_key,
            pm.content_type,
            pm.metadata->>'caption' AS caption,
            COALESCE(pm.is_cover, false) AS is_cover,
            pm.created_at
        FROM project_media pm
        WHERE pm.project_id = $1
          AND COALESCE(pm.is_system_generated, false) = false
        ORDER BY
          COALESCE(pm.is_cover, false) DESC,
          pm.created_at ASC
        `,
            [projectId]
        );

        return res.rows.map((row) => ({
            id: row.id,
            kind: row.kind ?? 'image',
            assetUrl: toPublicAssetUrl({
                asset_url: row.asset_url,
                s3_key: row.s3_key ?? null,
            }) ?? "",
            contentType: row.content_type ?? null,
            caption: row.caption ?? null,
            isCover: Boolean(row.is_cover),
            createdAt: row.created_at,
        }));
    }

    private async loadProjectDocuments(projectId: string): Promise<ProjectDetailDocumentItem[]> {
        const res = await this.db.query<{
            id: string;
            kind: string;
            status: string | null;
            asset_url: string | null;
            s3_key: string | null;
            content_type: string | null;
            metadata: Record<string, unknown> | null;
            created_at: string;
        }>(
            `
    SELECT
        id,
        kind,
        status,
        asset_url,
        s3_key,
        content_type,
        metadata,
        created_at
    FROM project_documents
    WHERE project_id = $1
    ORDER BY created_at DESC
    `,
            [projectId]
        );

        return res.rows.map((row) => {
            const metadata =
                row.metadata && typeof row.metadata === "object" ? row.metadata : {};

            return {
                id: row.id,
                kind: row.kind,
                status: row.status ?? null,
                assetUrl: toPublicAssetUrl(row) ?? "",
                contentType: row.content_type ?? null,
                name:
                    typeof metadata.name === "string" && metadata.name.trim()
                        ? metadata.name.trim()
                        : null,
                type:
                    typeof metadata.type === "string" && metadata.type.trim()
                        ? metadata.type.trim()
                        : null,
                createdAt: row.created_at,
            };
        });
    }
    async updateProjectVisibility(
        projectId: string,
        currentUserId: string,
        projectVisibility: "public" | "private"
    ) {
        const existing = await this.db.query(
            `
            SELECT id, owner_user_id
            FROM projects
            WHERE id = $1
              AND COALESCE(delete_flag, false) = false
            LIMIT 1
            `,
            [projectId]
        );

        const row = existing.rows[0];
        if (!row) {
            return null;
        }

        if (row.owner_user_id !== currentUserId) {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }

        await this.db.query(
            `
            UPDATE projects
            SET visibility = $2,
                updated_at = now()
            WHERE id = $1
            `,
            [projectId, projectVisibility]
        );

        return this.getProjectById(projectId, currentUserId);
    }

    async deleteProject(projectId: string, currentUserId: string): Promise<boolean> {
        const existing = await this.db.query(
            `
        SELECT id, owner_user_id
        FROM projects
        WHERE id = $1
          AND COALESCE(delete_flag, false) = false
        LIMIT 1
        `,
            [projectId]
        );

        const row = existing.rows[0];
        if (!row) {
            return false;
        }

        if (row.owner_user_id !== currentUserId) {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }

        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            await client.query(
                `
            UPDATE projects
            SET delete_flag = true,
                updated_at = now()
            WHERE id = $1
            `,
                [projectId]
            );

            await client.query(
                `
            UPDATE project_users
            SET delete_flag = true,
                updated_at = now()
            WHERE project_id = $1
              AND COALESCE(delete_flag, false) = false
            `,
                [projectId]
            );

            await client.query(
                `
            UPDATE project_opportunities
            SET delete_flag = true,
                deleted_at = now(),
                updated_at = now(),
                updated_by = $2
            WHERE project_id = $1
              AND COALESCE(delete_flag, false) = false
            `,
                [projectId, currentUserId]
            );

            await client.query(
                `
            UPDATE project_updates
            SET delete_flag = true,
                deleted_at = now(),
                updated_at = now(),
                updated_by = $2
            WHERE project_id = $1
              AND COALESCE(delete_flag, false) = false
            `,
                [projectId, currentUserId]
            );

            await client.query(
                `
            DELETE FROM user_saved_items
            WHERE entity_type = 'project'
              AND entity_id = $1
            `,
                [projectId]
            );

            await client.query(
                `
            DELETE FROM user_saved_items usi
            USING project_opportunities po
            WHERE usi.entity_type = 'opportunity'
              AND usi.entity_id = po.id
              AND po.project_id = $1
            `,
                [projectId]
            );

            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}