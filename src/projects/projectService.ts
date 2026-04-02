import type { Pool } from "pg";
import type { CreateProjectInput, CreateProjectUpdateBody, UpdateProjectBody } from "./schema.js";
import { toPublicAssetUrl } from "../lib/s3Media.js";

export type ProjectRow = {
    id: string;
    company_id: string | null;
    owner_user_id: string;
    name: string;
    tagline: string | null;
    project_type: string;
    stage: string;
    visibility: string;
    host_country: string | null;
    host_region: string | null;
    latitude: string | null;
    longitude: string | null;
    story: string | null;
    approach: string | null;
    description: string | null;
    created_at: string;
    updated_at: string;
};

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
    memberId: string;
    userId?: string | undefined | null;
    companyId?: string | undefined | null;
    role?: string | undefined | null;
    permission?: "creator" | "viewer" | undefined | null;
};

type ProjectTeamMemberRow = {
    id: string;
    member_type: "user" | "company";
    member_user_id: string | null;
    member_company_id: string | null;
    role: string | null;
    permission: "creator" | "viewer";
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
            totalAreaHa: visible("overview") || visible("impact") ? detail.totalAreaHa : null,
            estimatedAnnualRemoval:
                visible("overview") || visible("impact") ? detail.estimatedAnnualRemoval : null,

            storyProblem: visible("story") ? detail.storyProblem : null,
            storyApproach: visible("story") ? detail.storyApproach : null,

            country: visible("location") ? detail.country : null,
            region: visible("location") ? detail.region : null,

            readiness: visible("readiness") ? detail.readiness : [],
            registryName: visible("registry") ? detail.registryName : null,
            registryStatus: visible("registry") ? detail.registryStatus : null,
            registryProjectId: visible("registry") ? detail.registryProjectId : null,

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
              p.description,
              p.host_country,
              p.host_region,
              p.latitude,
              p.longitude,
              p.story,
              p.approach,
              p.methodology_version,
              p.pdd_status,
              p.expected_annual_reductions,
              p.visibility,
              p.owner_user_id,
              p.company_id,
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
            description: row.description ?? null,
            companyName: row.company_name ?? null,
            country: row.host_country ?? null,
            region: row.host_region ?? null,
            coverImageUrl: media.find((item) => item.isCover)?.assetUrl ?? media[0]?.assetUrl ?? null,

            projectVisibility: row.visibility ?? null,

            storyProblem: row.story ?? null,
            storyApproach: row.approach ?? null,

            methodology: row.methodology_version ?? null,
            registryName: null,
            registryStatus: row.pdd_status ?? null,
            registryProjectId: null,

            totalAreaHa: null,
            estimatedAnnualRemoval:
                row.expected_annual_reductions == null
                    ? null
                    : JSON.stringify(row.expected_annual_reductions),

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
                    input.visibility.trim(),
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
                const memberUserId =
                    memberType === "user" ? (member.userId ?? member.memberId) : null;
                const memberCompanyId =
                    memberType === "company" ? (member.companyId ?? member.memberId) : null;

                if (memberType === "user" && memberUserId === userId) continue;
                if (!memberUserId && !memberCompanyId) continue;

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
                        VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), false, now(), now())
                        `,
                    [
                        projectId,
                        memberType,
                        memberUserId,
                        memberCompanyId,
                        member.permission ?? "viewer",
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
        c.display_name AS developer_name,
        (sp.project_id IS NOT NULL) AS is_saved,
        (p.owner_user_id = ${userIdParam}) AS is_mine
    FROM projects p
    LEFT JOIN companies c
        ON c.id = p.company_id
       AND COALESCE(c.delete_flag, false) = false
    LEFT JOIN saved_projects sp
        ON sp.project_id = p.id
    WHERE COALESCE(p.delete_flag, false) = false
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
        bp.is_mine
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
                'isMine', pp.is_mine
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

        return row;
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

            if (patch.team) {
                await this.replaceProjectTeam(
                    projectId,
                    currentUserId,
                    patch.team.map((member) => ({
                        ...member,
                        permission:
                            member.memberType === "company"
                                ? null
                                : (member.permission ?? "viewer"),
                    }))
                );
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
          pu.role,
          pu.permission,

          CASE
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
            WHEN pu.member_type = 'user' THEN un.email
            ELSE NULL
          END AS email,

          CASE
            WHEN pu.member_type = 'user' THEN owner_c.display_name
            ELSE c.display_name
          END AS company_name

        FROM project_users pu
        LEFT JOIN users_new un
          ON pu.member_type = 'user'
         AND un.id = pu.member_user_id
        LEFT JOIN user_profiles up
          ON pu.member_type = 'user'
         AND up.user_id = pu.member_user_id
        LEFT JOIN companies c
          ON pu.member_type = 'company'
         AND c.id = pu.member_company_id
         AND COALESCE(c.delete_flag, false) = false
        LEFT JOIN companies owner_c
          ON pu.member_type = 'user'
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

            return {
                id: row.id,
                memberType,
                memberId: memberType === "company" ? companyId ?? row.id : userId ?? row.id,
                userId,
                companyId,
                name: row.display_name,
                role: row.role ?? "",
                companyName: row.company_name ?? "",
                avatarUrl: null,
                permission: row.permission === "creator" ? "creator" : "viewer",
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

        if (patch.name !== undefined) set('name', patch.name);
        if (patch.stage !== undefined) set('stage', patch.stage);
        if (patch.type !== undefined) set('project_type', patch.type);
        if (patch.description !== undefined) set('description', patch.description);
        if (patch.country !== undefined) set('host_country', patch.country);
        if (patch.region !== undefined) set('host_region', patch.region);
        if (patch.storyProblem !== undefined) set('story', patch.storyProblem);
        if (patch.storyApproach !== undefined) set('approach', patch.storyApproach);
        if (patch.methodology !== undefined) set('methodology_version', patch.methodology);
        if (patch.registryStatus !== undefined) set('pdd_status', patch.registryStatus);
        if (patch.estimatedAnnualRemoval !== undefined) {
            set(
                'expected_annual_reductions',
                patch.estimatedAnnualRemoval ? JSON.stringify({ value: patch.estimatedAnnualRemoval }) : null
            );
        }

        if (!updates.length) return;

        updates.push(`updated_at = now()`);
        values.push(projectId);

        await this.db.query(
            `
      UPDATE projects
      SET ${updates.join(', ')}
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
        await this.db.query(
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

        const cleaned = opportunities
            .map((item) => ({
                type: item.type?.trim() ?? '',
                description: item.description?.trim() ?? null,
                urgent: Boolean(item.urgent),
            }))
            .filter((item) => item.type);

        for (let index = 0; index < cleaned.length; index += 1) {
            const item = cleaned[index];

            if (item) {
                await this.db.query(
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
            }
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
            const memberUserId =
                memberType === "user" ? (member.userId ?? member.memberId) : null;
            const memberCompanyId =
                memberType === "company" ? (member.companyId ?? member.memberId) : null;

            if (memberType === "user" && memberUserId === currentUserId) continue;
            if (!memberUserId && !memberCompanyId) continue;

            const existing = await this.db.query<{ id: string }>(
                `
            SELECT id
            FROM project_users
            WHERE project_id = $1
              AND member_type = $2
              AND (
                ($2 = 'user' AND member_user_id = $3)
                OR
                ($2 = 'company' AND member_company_id = $4)
              )
            LIMIT 1
            `,
                [projectId, memberType, memberUserId, memberCompanyId]
            );

            const permissionValue =
                memberType === "company"
                    ? null
                    : (member.permission ?? "viewer");

            if (existing.rows[0]?.id) {
                await this.db.query(
                    `
            UPDATE project_users
            SET permission = $2,
                role = NULLIF($3, ''),
                delete_flag = false,
                updated_at = now()
            WHERE id = $1
            `,
                    [
                        existing.rows[0].id,
                        permissionValue,
                        member.role ?? null,
                    ]
                );
            } else {
                await this.db.query(
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
            VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), false, now(), now())
            `,
                    [
                        projectId,
                        memberType,
                        memberUserId,
                        memberCompanyId,
                        permissionValue,
                        member.role ?? null,
                    ]
                );
            }
        }
    }

    private normalizeProjectUpdateInput(item: ProjectUpdateInput) {
        const title = item.title?.trim() ?? "";
        const description = item.description?.trim() ?? null;
        const authorName = item.authorName?.trim() ?? null;
        const type = item.type === "stage" ? "stage" : "progress";

        const parsedDate =
            item.dateLabel && /^\d{4}-\d{2}-\d{2}$/.test(item.dateLabel)
                ? item.dateLabel
                : null;

        return {
            title,
            description,
            authorName,
            type,
            parsedDate,
        };
    }

    async createProjectMedia(
        projectId: string,
        userId: string,
        input: {
            kind?: string;
            assetUrl: string;
            contentType?: string | null;
            s3Key?: string | null;
            sha256?: string | null;
            caption?: string | null;
            isCover?: boolean;
            metadata?: Record<string, unknown>;
        }
    ) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            if (input.isCover) {
                await client.query(
                    `
                UPDATE project_media
                SET is_cover = false
                WHERE project_id = $1
                `,
                    [projectId]
                );
            }

            await client.query(
                `
            INSERT INTO project_media (
                project_id,
                kind,
                asset_url,
                content_type,
                sha256,
                metadata,
                s3_key,
                is_cover
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
            `,
                [
                    projectId,
                    input.kind?.trim() || "gallery",
                    input.assetUrl,
                    input.contentType ?? null,
                    input.sha256 ?? null,
                    JSON.stringify({
                        ...(input.metadata ?? {}),
                        caption: input.caption?.trim() || null,
                    }),
                    input.s3Key ?? null,
                    Boolean(input.isCover),
                ]
            );

            await client.query(
                `UPDATE projects SET updated_at = NOW() WHERE id = $1`,
                [projectId]
            );

            await client.query("COMMIT");
            return this.getProjectById(projectId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateProjectMedia(
        projectId: string,
        mediaId: string,
        userId: string,
        input: {
            caption?: string | null;
            isCover?: boolean;
        }
    ) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const existing = await client.query<{
                id: string;
                metadata: Record<string, unknown> | null;
            }>(
                `
            SELECT id, metadata
            FROM project_media
            WHERE id = $1
              AND project_id = $2
            LIMIT 1
            `,
                [mediaId, projectId]
            );

            const row = existing.rows[0];
            if (!row) {
                throw new Error("Media not found");
            }

            if (input.isCover) {
                await client.query(
                    `
                UPDATE project_media
                SET is_cover = false
                WHERE project_id = $1
                `,
                    [projectId]
                );
            }

            const nextMetadata = {
                ...(row.metadata ?? {}),
                ...(input.caption !== undefined
                    ? { caption: input.caption?.trim() || null }
                    : {}),
            };

            await client.query(
                `
            UPDATE project_media
            SET
                metadata = $3::jsonb,
                is_cover = COALESCE($4, is_cover)
            WHERE id = $1
              AND project_id = $2
            `,
                [
                    mediaId,
                    projectId,
                    JSON.stringify(nextMetadata),
                    input.isCover,
                ]
            );

            await client.query(
                `UPDATE projects SET updated_at = NOW() WHERE id = $1`,
                [projectId]
            );

            await client.query("COMMIT");
            return this.getProjectById(projectId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteProjectMedia(
        projectId: string,
        mediaId: string,
        userId: string
    ): Promise<{ s3Key: string | null; project: any | null }> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const existing = await client.query<{ s3_key: string | null }>(
                `
            DELETE FROM project_media
            WHERE id = $1
              AND project_id = $2
            RETURNING s3_key
            `,
                [mediaId, projectId]
            );

            const row = existing.rows[0];
            if (!row) {
                throw new Error("Media not found");
            }

            await client.query(
                `UPDATE projects SET updated_at = NOW() WHERE id = $1`,
                [projectId]
            );

            await client.query("COMMIT");
            return {
                s3Key: row.s3_key,
                project: await this.getProjectById(projectId, userId),
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async createProjectDocument(
        projectId: string,
        userId: string,
        input: {
            kind?: string;
            assetUrl: string;
            contentType?: string | null;
            s3Key?: string | null;
            sha256?: string | null;
            name?: string | null;
            type?: string | null;
            metadata?: Record<string, unknown>;
        }
    ) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            await client.query(
                `
            INSERT INTO project_documents (
                project_id,
                kind,
                asset_url,
                content_type,
                sha256,
                metadata,
                s3_key
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
            `,
                [
                    projectId,
                    input.kind?.trim() || "general",
                    input.assetUrl,
                    input.contentType ?? null,
                    input.sha256 ?? null,
                    JSON.stringify({
                        ...(input.metadata ?? {}),
                        name: input.name?.trim() || null,
                        type: input.type?.trim() || null,
                    }),
                    input.s3Key ?? null,
                ]
            );

            await client.query(
                `UPDATE projects SET updated_at = NOW() WHERE id = $1`,
                [projectId]
            );

            await client.query("COMMIT");
            return this.getProjectById(projectId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateProjectDocument(
        projectId: string,
        documentId: string,
        userId: string,
        input: {
            name?: string | null;
            type?: string | null;
        }
    ) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const existing = await client.query<{
                id: string;
                metadata: Record<string, unknown> | null;
            }>(
                `
            SELECT id, metadata
            FROM project_documents
            WHERE id = $1
              AND project_id = $2
            LIMIT 1
            `,
                [documentId, projectId]
            );

            const row = existing.rows[0];
            if (!row) {
                throw new Error("Document not found");
            }

            const nextMetadata = {
                ...(row.metadata ?? {}),
                ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
                ...(input.type !== undefined ? { type: input.type?.trim() || null } : {}),
            };

            await client.query(
                `
            UPDATE project_documents
            SET metadata = $3::jsonb
            WHERE id = $1
              AND project_id = $2
            `,
                [
                    documentId,
                    projectId,
                    JSON.stringify(nextMetadata),
                ]
            );

            await client.query(
                `UPDATE projects SET updated_at = NOW() WHERE id = $1`,
                [projectId]
            );

            await client.query("COMMIT");
            return this.getProjectById(projectId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteProjectDocument(
        projectId: string,
        documentId: string,
        userId: string
    ): Promise<{ s3Key: string | null; project: any | null }> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const existing = await client.query<{ s3_key: string | null }>(
                `
            DELETE FROM project_documents
            WHERE id = $1
              AND project_id = $2
            RETURNING s3_key
            `,
                [documentId, projectId]
            );

            const row = existing.rows[0];
            if (!row) {
                throw new Error("Document not found");
            }

            await client.query(
                `UPDATE projects SET updated_at = NOW() WHERE id = $1`,
                [projectId]
            );

            await client.query("COMMIT");
            return {
                s3Key: row.s3_key,
                project: await this.getProjectById(projectId, userId),
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async createProjectUpdate(
        projectId: string,
        currentUserId: string,
        input: CreateProjectUpdateBody
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

        const sortOrderRes = await this.db.query<{ next_sort_order: number }>(
            `
            SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
            FROM project_updates
            WHERE project_id = $1
              AND COALESCE(delete_flag, false) = false
            `,
            [projectId]
        );

        const nextSortOrder = Number(sortOrderRes.rows[0]?.next_sort_order ?? 0);
        const normalized = this.normalizeProjectUpdateInput(input);

        const insertRes = await this.db.query<{
            id: string;
            title: string;
            description: string | null;
            update_date: string | null;
            author_name: string | null;
            update_type: "progress" | "stage" | null;
        }>(
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
            RETURNING
                id,
                title,
                description,
                update_date,
                author_name,
                update_type
            `,
            [
                projectId,
                normalized.title,
                normalized.description,
                normalized.parsedDate,
                normalized.authorName,
                normalized.type,
                nextSortOrder,
                currentUserId,
            ]
        );

        const created = insertRes.rows[0];
        if (created) {
            return {
                id: created.id,
                title: created.title,
                description: created.description ?? null,
                dateLabel: created.update_date
                    ? new Date(created.update_date).toISOString().slice(0, 10)
                    : null,
                authorName: created.author_name ?? null,
                type: created.update_type === "stage" ? "stage" : "progress",
            };
        }
    }

    private async assertCanEditProject(
        projectId: string,
        userId: string,
        client: Pool | { query: Pool["query"] } = this.db
    ): Promise<{ ownerUserId: string | null }> {
        const accessCheck = await client.query<{
            id: string;
            owner_user_id: string | null;
            user_permission: "creator" | "viewer" | null;
        }>(
            `
        SELECT
            p.id,
            p.owner_user_id,
            (
                SELECT pu.permission
                FROM project_users pu
                WHERE pu.project_id = p.id
                  AND pu.member_type = 'user'
                  AND pu.member_user_id = $2
                  AND COALESCE(pu.delete_flag, false) = false
                ORDER BY CASE pu.permission WHEN 'creator' THEN 1 ELSE 2 END
                LIMIT 1
            ) AS user_permission
        FROM projects p
        WHERE p.id = $1
          AND COALESCE(p.delete_flag, false) = false
        LIMIT 1
        `,
            [projectId, userId]
        );

        const existing = accessCheck.rows[0];
        if (!existing) {
            throw new Error("Project not found");
        }

        const canEdit =
            existing.owner_user_id === userId || existing.user_permission === "creator";

        if (!canEdit) {
            throw new Error("Forbidden");
        }

        return { ownerUserId: existing.owner_user_id };
    }

    private async loadProjectMedia(projectId: string): Promise<ProjectDetailMediaItem[]> {
        const res = await this.db.query<{
            id: string;
            kind: string;
            asset_url: string | null;
            s3_key: string | null;
            content_type: string | null;
            metadata: Record<string, unknown> | null;
            is_cover: boolean | null;
            created_at: string;
        }>(
            `
        SELECT
            id,
            kind,
            asset_url,
            s3_key,
            content_type,
            metadata,
            is_cover,
            created_at
        FROM project_media
        WHERE project_id = $1
        ORDER BY COALESCE(is_cover, false) DESC, created_at DESC
        `,
            [projectId]
        );

        return res.rows.map((row) => {
            const metadata =
                row.metadata && typeof row.metadata === "object" ? row.metadata : {};

            return {
                id: row.id,
                kind: row.kind,
                assetUrl: toPublicAssetUrl(row) ?? "",
                contentType: row.content_type ?? null,
                caption:
                    typeof metadata.caption === "string" && metadata.caption.trim()
                        ? metadata.caption.trim()
                        : null,
                isCover: Boolean(row.is_cover),
                createdAt: row.created_at,
            };
        });
    }

    private async loadProjectDocuments(projectId: string): Promise<ProjectDetailDocumentItem[]> {
        const res = await this.db.query<{
            id: string;
            kind: string;
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

    async listProjectUpdates(
        currentUserId: string | null,
        input?: { limit?: number }
    ): Promise<ListProjectUpdatesResult> {
        const limit = Math.min(Math.max(input?.limit ?? 5, 1), 20);

        const res = await this.db.query<{
            id: string;
            project_id: string;
            project_name: string;
            title: string;
            description: string | null;
            update_date: string | null;
            author_name: string | null;
            update_type: "progress" | "stage" | null;
            created_at: string;
        }>(
            `
            SELECT
                pu.id,
                pu.project_id,
                p.name AS project_name,
                pu.title,
                pu.description,
                pu.update_date,
                pu.author_name,
                pu.update_type,
                pu.created_at
            FROM project_updates pu
            INNER JOIN projects p
                ON p.id = pu.project_id
               AND COALESCE(p.delete_flag, false) = false
            WHERE COALESCE(pu.delete_flag, false) = false
              AND COALESCE(pu.is_active, true) = true
              AND (
                    p.owner_user_id = $1
                    OR EXISTS (
                        SELECT 1
                        FROM project_users px
                        WHERE px.project_id = p.id
                          AND px.member_type = 'user'
                          AND px.member_user_id = $1
                          AND COALESCE(px.delete_flag, false) = false
                    )
                  )
            ORDER BY
                pu.update_date DESC NULLS LAST,
                pu.created_at DESC
            LIMIT $2
            `,
            [currentUserId, limit]
        );

        return {
            items: res.rows.map((row) => ({
                id: row.id,
                projectId: row.project_id,
                projectName: row.project_name,
                title: row.title,
                description: row.description ?? null,
                dateLabel: row.update_date
                    ? new Date(row.update_date).toISOString().slice(0, 10)
                    : null,
                authorName: row.author_name ?? null,
                type: row.update_type === "stage" ? "stage" : "progress",
                createdAt: row.created_at,
            })),
        };
    }

    async listProjectOpportunities(
        currentUserId: string | null,
        input?: { limit?: number }
    ): Promise<ListProjectOpportunitiesResult> {
        const limit = Math.min(Math.max(input?.limit ?? 5, 1), 20);

        const res = await this.db.query<{
            id: string;
            project_id: string;
            project_name: string;
            opportunity_type: string;
            description: string | null;
            is_priority: boolean | null;
            created_at: string;
        }>(
            `
        SELECT
            po.id,
            po.project_id,
            p.name AS project_name,
            po.opportunity_type,
            po.description,
            po.is_priority,
            po.created_at
        FROM project_opportunities po
        INNER JOIN projects p
            ON p.id = po.project_id
           AND COALESCE(p.delete_flag, false) = false
        WHERE COALESCE(po.delete_flag, false) = false
          AND COALESCE(po.is_active, true) = true
          AND (
                p.owner_user_id = $1
                OR EXISTS (
                    SELECT 1
                    FROM project_users px
                    WHERE px.project_id = p.id
                      AND px.member_type = 'user'
                      AND px.member_user_id = $1
                      AND COALESCE(px.delete_flag, false) = false
                )
              )
        ORDER BY
            COALESCE(po.is_priority, false) DESC,
            po.sort_order ASC NULLS LAST,
            po.created_at DESC
        LIMIT $2
        `,
            [currentUserId, limit]
        );

        return {
            items: res.rows.map((row) => ({
                id: row.id,
                projectId: row.project_id,
                projectName: row.project_name,
                type: row.opportunity_type,
                description: row.description ?? null,
                urgent: Boolean(row.is_priority),
                createdAt: row.created_at,
            })),
        };
    }
}