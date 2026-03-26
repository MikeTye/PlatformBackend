import type { Pool } from "pg";
import type { CreateProjectInput } from "./schema.js";

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
    cobenefit_items: Array<{ key: string; label: string }>;
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

export type ProjectDetailResult = {
    id: string;
    upid: string;
    slug: string | null;
    name: string;
    description: string | null;
    type: string | null;
    stage: string;
    isOwner: boolean;
    isSaved: boolean;
    developerName: string | null;
    companyId: string | null;
    companySlug: string | null;
    location: {
        country: string | null;
        countryCode: string | null;
        region: string | null;
        latitude: number | null;
        longitude: number | null;
    } | null;
    registry: {
        standard: string | null;
        methodology: string | null;
        registryProjectId: string | null;
        registryUrl: string | null;
    } | null;
    story: {
        summary: string | null;
        problem: string | null;
        solution: string | null;
        impact: string | null;
    } | null;
    documents: Array<{
        id: string;
        name: string;
        type: string | null;
        fileUrl: string | null;
        visibility: string | null;
        uploadedAt: string | null;
    }>;
    media: Array<{
        id: string;
        type: string | null;
        url: string;
        thumbnailUrl: string | null;
        title: string | null;
        description: string | null;
        isCover: boolean;
        visibility: string | null;
    }>;
    partners: Array<{
        id: string;
        name: string;
        role: string | null;
        companyId: string | null;
        companySlug: string | null;
        logoUrl: string | null;
        visibility: string | null;
    }>;
    updates: Array<never>;
    opportunities: Array<{
        id: string;
        title: string;
        description: string | null;
        category: string | null;
        visibility: string | null;
    }>;
};

function dedupeCobenefits(items: Array<{ key: string; label: string }>) {
    const seen = new Set<string>();
    const result: Array<{ key: string; label: string }> = [];

    for (const item of items) {
        const key = item.key.trim();
        const label = item.label.trim();
        const dedupeKey = `${key}::${label}`.toLowerCase();

        if (!key || !label || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        result.push({ key, label });
    }

    return result;
}

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

    if (input.cobenefitItems.length > 0) {
        parts.push(
            `Co-benefits: ${input.cobenefitItems
                .map((item) => item.label.trim())
                .filter(Boolean)
                .join(", ")}`
        );
    }

    return parts.length ? parts.join("\n\n") : null;
}

export class ProjectService {
    constructor(private readonly db: Pool) { }

    async createProject(userId: string, input: CreateProjectInput): Promise<ProjectRow> {
        if (input.companyId) {
            const companyCheck = await this.db.query<{ id: string }>(
                `
                SELECT id
                FROM companies
                WHERE id = $1
                  AND delete_flag = false
                  AND owner_user_id = $2
                LIMIT 1
                `,
                [input.companyId, userId]
            );

            if (!companyCheck.rows[0]) {
                throw new Error("Company not found or not owned by user");
            }
        }

        const cobenefitItems = dedupeCobenefits(input.cobenefitItems);
        const description = buildDescription(input);

        const result = await this.db.query<ProjectRow>(
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
                cobenefit_items,
                description
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                NULLIF($5, ''),
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                NULLIF($13, ''),
                NULLIF($14, ''),
                $15::jsonb,
                $16
            )
            RETURNING *
            `,
            [
                input.companyId,
                userId,
                input.name.trim(),
                input.name,
                input.tagline.trim(),
                input.type.trim(),
                input.stage.trim(),
                input.visibility.trim(),
                input.country.trim(),
                input.state,
                input.coordinates?.lat ?? null,
                input.coordinates?.lng ?? null,
                input.story.trim(),
                input.approach.trim(),
                JSON.stringify(cobenefitItems),
                description,
            ]
        );

        const row = result.rows[0];

        if (!row) {
            throw new Error("Insert project returned no rows");
        }

        return row;
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

    async getProjectDetail(
        input: GetProjectDetailInput
    ): Promise<ProjectDetailResult | null> {
        const sql = `
WITH saved_projects AS (
    SELECT usi.entity_id AS project_id
    FROM user_saved_items usi
    WHERE usi.user_id = $2
      AND usi.entity_type = 'project'
),
base_project AS (
    SELECT
        p.id,
        p.upid,
        NULL::text AS slug,
        p.name,
        p.description,
        p.project_type,
        p.stage,
        p.owner_user_id,
        p.company_id,
        c.display_name AS developer_name,
        '' AS company_slug,
        p.host_country,
        p.host_country_code,
        p.host_region,
        p.latitude,
        p.longitude,
        p.registration_platform,
        p.registry_project_url,
        p.story,
        p.approach,
        m.code AS methodology_code,
        m.name AS methodology_name,
        (sp.project_id IS NOT NULL) AS is_saved,
        (p.owner_user_id = $2) AS is_owner
    FROM projects p
    LEFT JOIN companies c
        ON c.id = p.company_id
       AND COALESCE(c.delete_flag, false) = false
    LEFT JOIN methodologies m
        ON m.id = p.methodology_id
    LEFT JOIN saved_projects sp
        ON sp.project_id = p.id
    WHERE p.id = $1
      AND COALESCE(p.delete_flag, false) = false
),
documents AS (
    SELECT COALESCE(json_agg(json_build_object(
        'id', pd.id,
        'name', COALESCE(NULLIF(TRIM(pd.name), ''), 'Untitled document'),
        'type', pd.type,
        'fileUrl', pd.asset_url,
        'visibility', pd.visibility,
        'uploadedAt', pd.created_at
    ) ORDER BY pd.created_at DESC), '[]'::json) AS items
    FROM project_documents pd
    WHERE pd.project_id = $1
      AND COALESCE(pd.delete_flag, false) = false
),
media AS (
    SELECT COALESCE(json_agg(json_build_object(
        'id', pm.id,
        'type', pm.kind,
        'url', pm.asset_url,
        'thumbnailUrl', NULL,
        'title', pm.title,
        'description', pm.description,
        'isCover', COALESCE(pm.is_cover, false),
        'visibility', pm.visibility
    ) ORDER BY COALESCE(pm.is_cover, false) DESC, pm.created_at DESC), '[]'::json) AS items
    FROM project_media pm
    WHERE pm.project_id = $1
),
partners AS (
    SELECT COALESCE(json_agg(json_build_object(
        'id', pp.id,
        'name', COALESCE(pc.display_name, pp.name, 'Unknown partner'),
        'role', pp.role,
        'companyId', pp.company_id,
        'companySlug', pc.slug,
        'logoUrl', NULL,
        'visibility', pp.visibility
    ) ORDER BY pp.created_at ASC), '[]'::json) AS items
    FROM project_partners pp
    LEFT JOIN companies pc
        ON pc.id = pp.company_id
       AND COALESCE(pc.delete_flag, false) = false
    WHERE pp.project_id = $1
),
opportunities AS (
    SELECT COALESCE(json_agg(json_build_object(
        'id', po.id,
        'title', COALESCE(NULLIF(TRIM(po.title), ''), COALESCE(NULLIF(TRIM(po.opportunity_type), ''), 'Opportunity')),
        'description', po.description,
        'category', po.opportunity_type,
        'visibility', po.visibility
    ) ORDER BY po.created_at DESC), '[]'::json) AS items
    FROM project_opportunities po
    WHERE po.project_id = $1
)
SELECT json_build_object(
    'id', bp.id,
    'upid', COALESCE(bp.upid, ''),
    'slug', bp.slug,
    'name', bp.name,
    'description', bp.description,
    'type', bp.project_type,
    'stage', bp.stage,
    'isOwner', bp.is_owner,
    'isSaved', bp.is_saved,
    'developerName', bp.developer_name,
    'companyId', bp.company_id,
    'companySlug', bp.company_slug,
    'location', json_build_object(
        'country', bp.host_country,
        'countryCode', bp.host_country_code,
        'region', bp.host_region,
        'latitude', CASE WHEN bp.latitude IS NULL THEN NULL ELSE bp.latitude::float END,
        'longitude', CASE WHEN bp.longitude IS NULL THEN NULL ELSE bp.longitude::float END
    ),
    'registry', json_build_object(
        'standard', bp.registration_platform,
        'methodology', COALESCE(bp.methodology_code, bp.methodology_name),
        'registryProjectId', NULL,
        'registryUrl', bp.registry_project_url
    ),
    'story', json_build_object(
        'summary', bp.description,
        'problem', bp.story,
        'solution', bp.approach,
        'impact', NULL
    ),
    'documents', d.items,
    'media', m.items,
    'partners', p.items,
    'updates', '[]'::json,
    'opportunities', o.items
) AS result
FROM base_project bp
CROSS JOIN documents d
CROSS JOIN media m
CROSS JOIN partners p
CROSS JOIN opportunities o
`;
        const result = await this.db.query<{ result: ProjectDetailResult }>(sql, [
            input.projectId,
            input.userId ?? null,
        ]);

        return result.rows[0]?.result ?? null;
    }
}