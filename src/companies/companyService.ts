import type { Pool } from "pg";
import type {
    CreateCompanyInput, ListCompaniesQuery, UpdateCompanyDetailInput,
    CompanyInviteLinkResponse,
} from "./schema.js";
import crypto from "crypto";

export type CompanyRow = {
    id: string;
    function_description: string | null;
    geographical_coverage: string[] | null;
    company_email: string | null;
    website_url: string | null;
    phone_number: string | null;
    registration_url: string | null;
    created_at: string;
    updated_at: string;
    delete_flag: boolean;
    owner_user_id: string | null;
    display_name: string;
    logo_url?: string | null;
    company_roles?: string[] | null;
    service_categories?: string[] | null;
    primary_country?: string | null;
    country_code?: string | null;
    is_verified?: boolean;
    inherit_company_permissions_to_projects?: boolean | null;
    full_description?: string | null;
    project_types?: string[] | null;
    services?: string[] | null;
};

export type CompanyMediaRow = {
    id: string;
    company_id: string;
    kind: string;
    asset_url: string;
    content_type: string | null;
    sha256: string | null;
    metadata: Record<string, unknown>;
    s3_key: string | null;
    is_cover: boolean;
    created_at: string;
};

export type CompanyListScope = "all" | "mine" | "saved";
export type CompanyListSortField =
    | "displayName"
    | "country"
    | "projects"
    | "createdAt";

export type CompanyAssetVisibility = "public" | "company_users";

export type CompanyDetailMediaItem = {
    id: string;
    kind: string;
    assetUrl: string;
    contentType: string | null;
    caption: string | null;
    isCover: boolean;
    createdAt: string;
};

export type CompanyDetailDocumentItem = {
    id: string;
    kind: string;
    assetUrl: string;
    contentType: string | null;
    name: string | null;
    type: string | null;
    createdAt: string;
};

export type CompanyFacetOption = {
    value: string;
    count: number;
};

export type CompanyListItem = {
    id: string;
    displayName: string;
    companyRoles: string[];
    services: string[];
    serviceCategories: string[];
    geographicalCoverage: string[];
    country: string | null;
    countryCode: string | null;
    functionDescription: string | null;
    websiteUrl: string | null;
    logoUrl: string | null;
    projectsCount: number;
    createdAt: string;
    isMine: boolean;
    isSaved: boolean;
    isVerified: boolean;
};

export type ListCompaniesResult = {
    items: CompanyListItem[];
    total: number;
    page: number;
    pageSize: number;
    sortField: CompanyListSortField;
    sortDirection: "asc" | "desc";
    counts: {
        all: number;
        mine: number;
        saved: number;
    };
    filters: {
        roles: CompanyFacetOption[];
        serviceCategories: CompanyFacetOption[];
        countries: CompanyFacetOption[];
    };
};

export type CompanyAccessRole = "creator" | "viewer" | null;
export type CompanyPrivacyLevel = "public" | "company_users";

export type CompanyPrivacyMap = {
    header: CompanyPrivacyLevel;
    about: CompanyPrivacyLevel;
    permissions: CompanyPrivacyLevel;
    team: CompanyPrivacyLevel;
    media: CompanyPrivacyLevel;
    documents: CompanyPrivacyLevel;
    projects: CompanyPrivacyLevel;
    services: CompanyPrivacyLevel;
    geographicalCoverage: CompanyPrivacyLevel;
    serviceCategories: CompanyPrivacyLevel;
    projectTypes: CompanyPrivacyLevel;
};

export type CompanyDetailProjectItem = {
    id: string;
    upid: string | null;
    name: string;
    stage: string | null;
    country: string | null;
    countryCode: string | null;
    type: string | null;
    hectares: number | null;
    expectedCredits: string | null;
};

export type CompanyDetailTeamMember = {
    id?: string;
    name: string;
    role: string;
    email?: string | null;
    profileSlug?: string | null;
};

export type CompanyDetailResult = {
    id: string;
    slug?: string | null;
    legalName: string;
    displayName: string | null;
    type: string;
    serviceTypes: string[];
    projectTypes: string[];
    serviceCategories: string[];
    country: string | null;
    countryCode: string | null;
    description: string | null;
    fullDescription: string | null;
    logoUrl: string | null;
    website: string | null;

    isMyCompany: boolean;
    accessRole: CompanyAccessRole;
    privacy: CompanyPrivacyMap;

    projects: CompanyDetailProjectItem[];
    projectsParticipated: CompanyDetailProjectItem[];
    services: string[];
    team: CompanyDetailTeamMember[];
    geographicalCoverage: string[];
    permissions: Array<{
        id: string;
        userId: string;
        name: string;
        email: string;
        role: string;
        permission: "creator" | "viewer";
    }>;
    inheritCompanyPermissionsToProjects?: boolean;
    inviteToken?: string | null;
    externalInviteUrl?: string | null;

    media: CompanyDetailMediaItem[];
    documents: CompanyDetailDocumentItem[];
};

export type CompanyInviteLinkRow = {
    id: string;
    company_id: string;
    token: string;
    created_by_user_id: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

export type CompanyInviteEventType =
    | "link_created"
    | "link_regenerated"
    | "link_deactivated"
    | "link_reactivated"
    | "link_opened"
    | "signup_started"
    | "signup_completed"
    | "membership_granted";

function defaultCompanyPrivacy(): CompanyPrivacyMap {
    return {
        header: "public",
        about: "public",
        team: "public",
        media: "public",
        documents: "public",
        projects: "public",
        services: "public",
        serviceCategories: "public",
        projectTypes: "public",
        geographicalCoverage: "public",
        permissions: "public",
    };
}

function normalizeNullableString(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function dedupeOptional(values?: string[]): string[] {
    return [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
}

function dedupeNonEmpty(values: string[]): string[] {
    return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

type CompanyAccessResolution = {
    isMyCompany: boolean;
    accessRole: CompanyAccessRole;
    hasViewerAccess: boolean;
};

function normalizeCompanySectionKey(sectionKey: string): keyof CompanyPrivacyMap | null {
    switch (sectionKey) {
        case "overview":
        case "header":
            return "header";
        case "about":
            return "about";
        case "team":
            return "team";
        case "media":
            return "media";
        case "documents":
            return "documents";
        case "projects":
            return "projects";
        case "services":
            return "services";
        case "serviceCategories":
        case "service_categories":
            return "serviceCategories";
        case "projectTypes":
        case "project_types":
            return "projectTypes";
        case "geographicalCoverage":
        case "geographical_coverage":
            return "geographicalCoverage";
        case "permissions":
            return "permissions";
        default:
            return null;
    }
}

function canViewSection(
    access: CompanyAccessResolution,
    privacy: CompanyPrivacyMap,
    section: keyof CompanyPrivacyMap
): boolean {
    if (access.hasViewerAccess) return true;
    return privacy[section] === "public";
}

export class CompanyService {
    constructor(private readonly db: Pool) { }

    async createCompany(userId: string, input: CreateCompanyInput): Promise<CompanyRow> {
        const geographicalCoverage = dedupeNonEmpty(input.regions);
        const companyRoles = dedupeNonEmpty(input.roles);
        const serviceCategories = dedupeNonEmpty(input.serviceCategories);

        const projectTypes = dedupeNonEmpty([
            ...input.projectTypes.filter((v) => v !== "other"),
            input.otherProjectType.trim(),
        ]);

        const result = await this.db.query<CompanyRow>(
            `
        INSERT INTO companies (
            display_name,
            function_description,
            geographical_coverage,
            company_email,
            website_url,
            phone_number,
            registration_url,
            owner_user_id,
            company_roles,
            service_categories,
            primary_country,
            country_code,
            is_verified,
            inherit_company_permissions_to_projects,
            full_description,
            project_types,
            services
        )
        VALUES (
            $1, $2, $3, NULL, NULL, NULL, NULL, $4, $5, $6, $7, NULL, false, false, NULL, $8, $9
        )
        RETURNING *
        `,
            [
                input.name.trim(),
                normalizeNullableString(input.description),
                geographicalCoverage,
                userId,
                companyRoles,
                serviceCategories,
                input.country.trim(),
                projectTypes,
                [] as string[],
            ]
        );

        const row = result.rows[0];
        if (!row) throw new Error("Insert company returned no rows");

        await this.db.query(
            `
        INSERT INTO company_users (company_id, user_id, permission, role, delete_flag)
        VALUES ($1, $2, 'creator', 'Owner', false)
        ON CONFLICT (company_id, user_id)
        DO UPDATE SET
            permission = 'creator',
            role = EXCLUDED.role,
            delete_flag = false,
            updated_at = NOW()
        `,
            [row.id, userId]
        );

        return row;
    }

    private buildCompanyListOrderBy(
        sortField: CompanyListSortField,
        sortDirection: "asc" | "desc"
    ): string {
        const dir = sortDirection === "asc" ? "ASC" : "DESC";

        switch (sortField) {
            case "country":
                return `country ${dir} NULLS LAST, display_name ASC`;
            case "projects":
                return `projects_count ${dir} NULLS LAST, display_name ASC`;
            case "createdAt":
                return `created_at ${dir} NULLS LAST, display_name ASC`;
            case "displayName":
            default:
                return `display_name ${dir} NULLS LAST, created_at DESC`;
        }
    }

    async listCompanies(
        userId: string | null,
        query: ListCompaniesQuery
    ): Promise<ListCompaniesResult> {
        const page = Math.max(query.page ?? 1, 1);
        const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
        const offset = (page - 1) * pageSize;

        const scope: CompanyListScope = query.scope ?? "all";
        const sortField: CompanyListSortField = query.sortField ?? "displayName";
        const sortDirection: "asc" | "desc" =
            query.sortDirection === "desc" ? "desc" : "asc";

        const q = query.q?.trim() || null;
        const roles = (query.roles ?? []).map((v) => v.trim()).filter(Boolean);
        const serviceCategories = (query.serviceCategories ?? []).map((v) => v.trim()).filter(Boolean);
        const countries = (query.countries ?? []).map((v) => v.trim()).filter(Boolean);

        const values: unknown[] = [];
        let idx = 1;

        const push = (value: unknown) => {
            values.push(value);
            return `$${idx++}`;
        };

        const userIdParam = push(userId ?? null);
        const qParam = push(q);
        const rolesParam = push(roles);
        const serviceCategoriesParam = push(serviceCategories);
        const countriesParam = push(countries);
        const limitParam = push(pageSize);
        const offsetParam = push(offset);

        const orderBySql = this.buildCompanyListOrderBy(sortField, sortDirection);

        const sql = `
WITH saved_companies AS (
    SELECT usi.entity_id AS company_id
    FROM user_saved_items usi
    WHERE usi.user_id = ${userIdParam}
      AND usi.entity_type = 'company'
),
project_counts AS (
    SELECT
        p.company_id,
        COUNT(*)::int AS projects_count
    FROM projects p
    WHERE COALESCE(p.delete_flag, false) = false
      AND p.company_id IS NOT NULL
    GROUP BY p.company_id
),
base_companies AS (
    SELECT
        c.id,
        COALESCE(NULLIF(TRIM(c.display_name), ''), '') AS display_name,
        COALESCE(c.company_roles, ARRAY[]::text[]) AS company_roles,
        COALESCE(c.services, ARRAY[]::text[]) AS services,
        COALESCE(c.service_categories, ARRAY[]::text[]) AS service_categories,
        COALESCE(c.geographical_coverage, ARRAY[]::text[]) AS geographical_coverage,
        c.primary_country AS country,
        c.country_code,
        c.function_description,
        c.website_url,
        cm.asset_url AS logo_url,
        COALESCE(pc.projects_count, 0) AS projects_count,
        c.created_at,
        c.owner_user_id,
        (sc.company_id IS NOT NULL) AS is_saved,
        (c.owner_user_id = ${userIdParam}) AS is_mine,
        COALESCE(c.is_verified, false) AS is_verified
    FROM companies c
    LEFT JOIN saved_companies sc
        ON sc.company_id = c.id
    LEFT JOIN project_counts pc
        ON pc.company_id = c.id
    LEFT JOIN LATERAL (
        SELECT cm.asset_url
        FROM company_media cm
        WHERE cm.company_id = c.id
        AND COALESCE(cm.is_cover, false) = true
        ORDER BY cm.created_at DESC
        LIMIT 1
    ) cm ON true
    WHERE COALESCE(c.delete_flag, false) = false
      AND (
        NULLIF(${qParam}::text, '') IS NULL
        OR COALESCE(c.display_name, '') ILIKE '%' || ${qParam}::text || '%'
        OR COALESCE(c.function_description, '') ILIKE '%' || ${qParam}::text || '%'
        OR COALESCE(c.full_description, '') ILIKE '%' || ${qParam}::text || '%'
        OR COALESCE(c.primary_country, '') ILIKE '%' || ${qParam}::text || '%'
        OR array_to_string(COALESCE(c.company_roles, ARRAY[]::text[]), ' ') ILIKE '%' || ${qParam}::text || '%'
        OR array_to_string(COALESCE(c.service_categories, ARRAY[]::text[]), ' ') ILIKE '%' || ${qParam}::text || '%'
        OR array_to_string(COALESCE(c.project_types, ARRAY[]::text[]), ' ') ILIKE '%' || ${qParam}::text || '%'
      )
),
scoped_companies AS (
    SELECT *
    FROM base_companies bc
    WHERE (
        ${scope === "all" ? "TRUE" : "FALSE"}
        OR (${scope === "mine" ? "TRUE" : "FALSE"} AND bc.owner_user_id = ${userIdParam})
        OR (${scope === "saved" ? "TRUE" : "FALSE"} AND bc.is_saved = true)
    )
),
filtered_companies AS (
    SELECT *
    FROM scoped_companies bc
    WHERE (
        cardinality(${rolesParam}::text[]) = 0
        OR bc.company_roles && ${rolesParam}::text[]
    )
      AND (
        cardinality(${serviceCategoriesParam}::text[]) = 0
        OR bc.service_categories && ${serviceCategoriesParam}::text[]
    )
      AND (
        cardinality(${countriesParam}::text[]) = 0
        OR bc.country = ANY(${countriesParam}::text[])
    )
),
paged_companies AS (
    SELECT *
    FROM filtered_companies
    ORDER BY ${orderBySql}
    LIMIT ${limitParam}
    OFFSET ${offsetParam}
),
role_facet_source AS (
    SELECT *
    FROM scoped_companies bc
    WHERE (
        cardinality(${serviceCategoriesParam}::text[]) = 0
        OR bc.service_categories && ${serviceCategoriesParam}::text[]
    )
      AND (
        cardinality(${countriesParam}::text[]) = 0
        OR bc.country = ANY(${countriesParam}::text[])
    )
),
service_facet_source AS (
    SELECT *
    FROM scoped_companies bc
    WHERE (
        cardinality(${rolesParam}::text[]) = 0
        OR bc.company_roles && ${rolesParam}::text[]
    )
      AND (
        cardinality(${countriesParam}::text[]) = 0
        OR bc.country = ANY(${countriesParam}::text[])
    )
),
country_facet_source AS (
    SELECT *
    FROM scoped_companies bc
    WHERE (
        cardinality(${rolesParam}::text[]) = 0
        OR bc.company_roles && ${rolesParam}::text[]
    )
      AND (
        cardinality(${serviceCategoriesParam}::text[]) = 0
        OR bc.service_categories && ${serviceCategoriesParam}::text[]
    )
),
role_facets AS (
    SELECT rf.value, COUNT(*)::int AS count
    FROM (
        SELECT DISTINCT bc.id, unnest(bc.company_roles) AS value
        FROM role_facet_source bc
    ) rf
    WHERE rf.value IS NOT NULL
      AND rf.value <> ''
    GROUP BY rf.value
),
service_category_facets AS (
    SELECT sf.value, COUNT(*)::int AS count
    FROM (
        SELECT DISTINCT bc.id, unnest(bc.service_categories) AS value
        FROM service_facet_source bc
    ) sf
    WHERE sf.value IS NOT NULL
      AND sf.value <> ''
    GROUP BY sf.value
),
country_facets AS (
    SELECT bc.country AS value, COUNT(*)::int AS count
    FROM country_facet_source bc
    WHERE bc.country IS NOT NULL
      AND bc.country <> ''
    GROUP BY bc.country
),
total_count AS (
    SELECT COUNT(*)::int AS total
    FROM filtered_companies
),
all_count AS (
    SELECT COUNT(*)::int AS count
    FROM base_companies
),
my_count AS (
    SELECT COUNT(*)::int AS count
    FROM base_companies
    WHERE owner_user_id = ${userIdParam}
),
saved_count AS (
    SELECT COUNT(*)::int AS count
    FROM base_companies
    WHERE is_saved = true
)
SELECT json_build_object(
    'items',
    COALESCE((
        SELECT json_agg(
            json_build_object(
                'id', pc.id,
                'displayName', pc.display_name,
                'companyRoles', pc.company_roles,
                'services', pc.services,
                'serviceCategories', pc.service_categories,
                'geographicalCoverage', pc.geographical_coverage,
                'country', pc.country,
                'countryCode', pc.country_code,
                'functionDescription', pc.function_description,
                'websiteUrl', pc.website_url,
                'logoUrl', pc.logo_url,
                'projectsCount', pc.projects_count,
                'createdAt', pc.created_at,
                'isMine', pc.is_mine,
                'isSaved', pc.is_saved,
                'isVerified', pc.is_verified
            )
            ORDER BY ${orderBySql}
        )
        FROM paged_companies pc
    ), '[]'::json),
    'total', (SELECT total FROM total_count),
    'page', ${page},
    'pageSize', ${pageSize},
    'sortField', '${sortField}',
    'sortDirection', '${sortDirection}',
    'counts', json_build_object(
        'all', (SELECT count FROM all_count),
        'mine', (SELECT count FROM my_count),
        'saved', (SELECT count FROM saved_count)
    ),
    'filters', json_build_object(
        'roles', COALESCE((
            SELECT json_agg(
                json_build_object('value', rf.value, 'count', rf.count)
                ORDER BY rf.value
            )
            FROM role_facets rf
        ), '[]'::json),
        'serviceCategories', COALESCE((
            SELECT json_agg(
                json_build_object('value', sf.value, 'count', sf.count)
                ORDER BY sf.value
            )
            FROM service_category_facets sf
        ), '[]'::json),
        'countries', COALESCE((
            SELECT json_agg(
                json_build_object('value', cf.value, 'count', cf.count)
                ORDER BY cf.value
            )
            FROM country_facets cf
        ), '[]'::json)
    )
) AS result
    `;

        const result = await this.db.query<{ result: ListCompaniesResult }>(sql, values);
        const row = result.rows[0]?.result;

        if (!row) {
            return {
                items: [],
                total: 0,
                page,
                pageSize,
                sortField,
                sortDirection,
                counts: { all: 0, mine: 0, saved: 0 },
                filters: { roles: [], serviceCategories: [], countries: [] },
            };
        }

        return row;
    }

    async saveCompanyLogo(params: {
        companyId: string;
        assetUrl: string;
        contentType?: string | null;
        s3Key?: string | null;
        sha256?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<CompanyMediaRow> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const existing = await client.query<{ id: string }>(
                `
                SELECT id
                FROM company_media
                WHERE company_id = $1
                  AND kind = 'logo'
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [params.companyId]
            );

            let result;

            if (existing.rows[0]) {
                result = await client.query<CompanyMediaRow>(
                    `
                    UPDATE company_media
                    SET
                        asset_url = $1,
                        content_type = $2,
                        sha256 = $3,
                        metadata = $4::jsonb,
                        s3_key = $5,
                        is_cover = false
                    WHERE id = $6
                    RETURNING *
                    `,
                    [
                        params.assetUrl,
                        params.contentType ?? null,
                        params.sha256 ?? null,
                        JSON.stringify(params.metadata ?? {}),
                        params.s3Key ?? null,
                        existing.rows[0].id,
                    ]
                );

                await client.query(
                    `
                    DELETE FROM company_media
                    WHERE company_id = $1
                      AND kind = 'logo'
                      AND id <> $2
                    `,
                    [params.companyId, existing.rows[0].id]
                );
            } else {
                result = await client.query<CompanyMediaRow>(
                    `
                    INSERT INTO company_media (
                        company_id,
                        kind,
                        asset_url,
                        content_type,
                        sha256,
                        metadata,
                        s3_key,
                        is_cover
                    )
                    VALUES ($1, 'logo', $2, $3, $4, $5::jsonb, $6, false)
                    RETURNING *
                    `,
                    [
                        params.companyId,
                        params.assetUrl,
                        params.contentType ?? null,
                        params.sha256 ?? null,
                        JSON.stringify(params.metadata ?? {}),
                        params.s3Key ?? null,
                    ]
                );
            }

            // await client.query(
            //     `
            //     UPDATE companies
            //     SET logo_url = $1
            //     WHERE id = $2
            //     `,
            //     [params.assetUrl, params.companyId]
            // );

            await client.query("COMMIT");
            const row = result.rows[0];
            if (!row) throw new Error("Insert logo returned no rows");
            return row;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getCompanyDetail(
        companyIdOrSlug: string,
        userId: string | null
    ): Promise<CompanyDetailResult | null> {
        const sql = `
    WITH target_company AS (
        SELECT
            c.id,
            c.id::text AS slug,
            c.display_name,
            c.company_roles,
            c.service_categories,
            c.geographical_coverage,
            c.primary_country,
            c.country_code,
            c.function_description,
            c.full_description,
            c.website_url,
            c.owner_user_id,
            c.inherit_company_permissions_to_projects,
            c.services,
            c.project_types
        FROM companies c
        WHERE COALESCE(c.delete_flag, false) = false
          AND (c.id::text = $1 OR LOWER(c.id::text) = LOWER($1))
        LIMIT 1
    ),
    company_users_cte AS (
        SELECT
            cu.id,
            cu.company_id,
            cu.user_id,
            cu.permission,
            cu.role,
            COALESCE(NULLIF(TRIM(un.name), ''), 'Unknown User') AS name,
            un.email AS email,
            NULL::text AS profile_slug
        FROM company_users cu
        JOIN target_company tc ON tc.id = cu.company_id
        LEFT JOIN users_new un ON un.id = cu.user_id
        WHERE COALESCE(cu.delete_flag, false) = false
    ),
    access_cte AS (
        SELECT
            tc.id AS company_id,
            (tc.owner_user_id = $2) AS is_my_company,
            CASE
                WHEN tc.owner_user_id = $2 THEN 'creator'
                WHEN EXISTS (
                    SELECT 1
                    FROM company_users_cte cu
                    WHERE cu.user_id = $2
                      AND cu.permission IN ('creator', 'viewer')
                ) THEN (
                    SELECT cu.permission
                    FROM company_users_cte cu
                    WHERE cu.user_id = $2
                      AND cu.permission IN ('creator', 'viewer')
                    ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                    LIMIT 1
                )
                ELSE NULL
            END AS access_role
        FROM target_company tc
    ),
    projects_cte AS (
        SELECT
            p.company_id,
            json_agg(
                json_build_object(
                    'id', p.id,
                    'upid', p.upid,
                    'name', COALESCE(NULLIF(TRIM(p.name), ''), p.upid, p.id::text),
                    'stage', p.stage,
                    'country', p.host_country,
                    'countryCode', NULL,
                    'type', p.project_type,
                    'hectares', NULL,
                    'expectedCredits', NULL
                )
                ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
            ) AS items
        FROM projects p
        JOIN target_company tc ON tc.id = p.company_id
        WHERE COALESCE(p.delete_flag, false) = false
        GROUP BY p.company_id
    ),
    team_cte AS (
        SELECT
            cu.company_id,
            json_agg(
                json_build_object(
                    'id', cu.user_id,
                    'name', cu.name,
                    'role', COALESCE(NULLIF(TRIM(cu.role), ''), 'Team Member'),
                    'email', cu.email,
                    'profileSlug', cu.profile_slug
                )
                ORDER BY cu.name ASC
            ) AS items
        FROM company_users_cte cu
        GROUP BY cu.company_id
    ),
    permissions_cte AS (
        SELECT
            cu.company_id,
            json_agg(
                json_build_object(
                    'id', cu.user_id,
                    'userId', cu.user_id,
                    'name', cu.name,
                    'email', cu.email,
                    'role', COALESCE(NULLIF(TRIM(cu.role), ''), 'Team Member'),
                    'permission', cu.permission
                )
                ORDER BY cu.name ASC
            ) AS items
        FROM company_users_cte cu
        WHERE cu.permission IN ('creator', 'viewer')
        GROUP BY cu.company_id
    ),
    media_cte AS (
    SELECT
        cm.company_id,
        json_agg(
            json_build_object(
                'id', cm.id,
                'kind', cm.kind,
                'url', cm.asset_url,
                'assetUrl', cm.asset_url,
                'contentType', cm.content_type,
                'caption', COALESCE(NULLIF(cm.metadata->>'caption', ''), 'Media'),
                'date', to_char(cm.created_at, 'DD Mon YYYY'),
                'isCover', COALESCE(cm.is_cover, false),
                'createdAt', cm.created_at
            )
            ORDER BY COALESCE(cm.is_cover, false) DESC, cm.created_at DESC
        ) AS items
    FROM company_media cm
    JOIN target_company tc ON tc.id = cm.company_id
    WHERE cm.kind <> 'logo'
    GROUP BY cm.company_id
    ),
    documents_cte AS (
        SELECT
            cd.company_id,
            json_agg(
                json_build_object(
                    'id', cd.id,
                    'kind', cd.kind,
                    'url', cd.asset_url,
                    'assetUrl', cd.asset_url,
                    'contentType', cd.content_type,
                    'name', COALESCE(NULLIF(cd.metadata->>'name', ''), 'Document'),
                    'type', COALESCE(NULLIF(cd.metadata->>'type', ''), cd.kind, 'Document'),
                    'date', to_char(cd.created_at, 'DD Mon YYYY'),
                    'createdAt', cd.created_at
                )
                ORDER BY cd.created_at DESC
            ) AS items
        FROM company_documents cd
        JOIN target_company tc ON tc.id = cd.company_id
        GROUP BY cd.company_id
    )
    SELECT json_build_object(
        'id', tc.id,
        'slug', tc.slug,
        'displayName', tc.display_name,
        'type', COALESCE(tc.company_roles[1], 'Service Provider'),
        'roles', COALESCE(tc.company_roles, ARRAY[]::text[]),
        'serviceTypes', COALESCE(tc.service_categories, ARRAY[]::text[]),
        'serviceCategories', COALESCE(tc.service_categories, ARRAY[]::text[]),
        'projectTypes', COALESCE(tc.project_types, ARRAY[]::text[]),
        'country', tc.primary_country,
        'countryCode', tc.country_code,
        'description', tc.function_description,
        'fullDescription', tc.full_description,
        'website', tc.website_url,
        'isMyCompany', ac.is_my_company,
        'accessRole', ac.access_role,
        'projects', COALESCE(pc.items, '[]'::json),
        'projectsParticipated', '[]'::json,
        'services', COALESCE(tc.services, ARRAY[]::text[]),
        'team', COALESCE(tm.items, '[]'::json),
        'media', COALESCE(mc.items, '[]'::json),
        'documents', COALESCE(dc.items, '[]'::json),
        'geographicalCoverage', COALESCE(tc.geographical_coverage, ARRAY[]::text[]),
        'permissions', COALESCE(pm.items, '[]'::json),
        'inheritCompanyPermissionsToProjects', COALESCE(tc.inherit_company_permissions_to_projects, false)
    ) AS result
    FROM target_company tc
    LEFT JOIN access_cte ac ON ac.company_id = tc.id
    LEFT JOIN projects_cte pc ON pc.company_id = tc.id
    LEFT JOIN team_cte tm ON tm.company_id = tc.id
    LEFT JOIN permissions_cte pm ON pm.company_id = tc.id
    LEFT JOIN media_cte mc ON mc.company_id = tc.id
    LEFT JOIN documents_cte dc ON dc.company_id = tc.id
    `;

        const result = await this.db.query<{ result: CompanyDetailResult }>(sql, [
            companyIdOrSlug,
            userId,
        ]);

        const row = result.rows[0]?.result;
        if (!row) return null;

        const access: CompanyAccessResolution = {
            isMyCompany: Boolean(row.isMyCompany),
            accessRole: row.accessRole,
            hasViewerAccess: row.isMyCompany || row.accessRole === "creator" || row.accessRole === "viewer",
        };

        const privacy = await this.getCompanyPrivacyMap(row.id);

        row.privacy = privacy;

        if (!canViewSection(access, privacy, "about")) {
            row.fullDescription = null;
            row.description = null;
        }

        if (!canViewSection(access, privacy, "services")) {
            row.services = [];
        }

        if (!canViewSection(access, privacy, "serviceCategories")) {
            row.serviceCategories = [];
            row.serviceTypes = [];
        }

        if (!canViewSection(access, privacy, "projectTypes")) {
            row.projectTypes = [];
        }

        if (!canViewSection(access, privacy, "geographicalCoverage")) {
            row.geographicalCoverage = [];
        }

        if (!canViewSection(access, privacy, "projects")) {
            row.projects = [];
            row.projectsParticipated = [];
        }

        if (!canViewSection(access, privacy, "team")) {
            row.team = [];
        }

        if (!canViewSection(access, privacy, "documents")) {
            row.documents = [];
        }

        if (!canViewSection(access, privacy, "media")) {
            row.media = [];
        }

        if (!canViewSection(access, privacy, "permissions")) {
            row.permissions = [];
        }

        if (access.isMyCompany || access.accessRole === "creator") {
            const invite = await this.getOrCreateCompanyInviteLink(row.id, userId!);
            row.inviteToken = invite.token;
            row.externalInviteUrl = invite.externalInviteUrl;
        } else {
            row.inviteToken = null;
            row.externalInviteUrl = null;
        }

        return row;
    }

    async updateCompanyDetail(
        companyId: string,
        userId: string,
        input: UpdateCompanyDetailInput
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const accessCheck = await client.query<{
                id: string;
                owner_user_id: string | null;
                user_permission: string | null;
            }>(
                `
                SELECT
                    c.id,
                    c.owner_user_id,
                    (
                        SELECT cu.permission
                        FROM company_users cu
                        WHERE cu.company_id = c.id
                          AND cu.user_id = $2
                          AND COALESCE(cu.delete_flag, false) = false
                        ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                        LIMIT 1
                    ) AS user_permission
                FROM companies c
                WHERE c.id = $1
                  AND COALESCE(c.delete_flag, false) = false
                LIMIT 1
                `,
                [companyId, userId]
            );

            const existing = accessCheck.rows[0];
            if (!existing) {
                await client.query("ROLLBACK");
                return null;
            }

            const canEdit =
                existing.owner_user_id === userId || existing.user_permission === "creator";

            if (!canEdit) {
                throw new Error("Forbidden");
            }

            const roles = input.roles !== undefined ? dedupeOptional(input.roles) : undefined;
            const serviceTypes =
                input.serviceTypes !== undefined ? dedupeOptional(input.serviceTypes) : undefined;
            const serviceCategories =
                input.serviceCategories !== undefined ? dedupeOptional(input.serviceCategories) : undefined;
            const services =
                input.services !== undefined ? dedupeOptional(input.services) : undefined;
            const projectTypes =
                input.projectTypes !== undefined ? dedupeOptional(input.projectTypes) : undefined;
            const geographicalCoverage =
                input.geographicalCoverage !== undefined
                    ? dedupeOptional(input.geographicalCoverage)
                    : undefined;

            await client.query(
                `
        UPDATE companies
        SET
            display_name = COALESCE($2, display_name),
            function_description = COALESCE($3, function_description),
            full_description = COALESCE($4, full_description),
            website_url = COALESCE($5, website_url),
            primary_country = COALESCE($6, primary_country),
            country_code = COALESCE($7, country_code),
            company_roles = CASE WHEN $8::text[] IS NULL THEN company_roles ELSE $8::text[] END,
            service_categories = CASE WHEN $9::text[] IS NULL THEN service_categories ELSE $9::text[] END,
            services = CASE WHEN $10::text[] IS NULL THEN services ELSE $10::text[] END,
            project_types = CASE WHEN $11::text[] IS NULL THEN project_types ELSE $11::text[] END,
            geographical_coverage = CASE WHEN $12::text[] IS NULL THEN geographical_coverage ELSE $12::text[] END,
            updated_at = NOW()
        WHERE id = $1
    `,
                [
                    companyId,
                    input.displayName !== undefined ? normalizeNullableString(input.displayName) : null,
                    input.description !== undefined ? normalizeNullableString(input.description) : null,
                    input.fullDescription !== undefined ? normalizeNullableString(input.fullDescription) : null,
                    input.website !== undefined ? normalizeNullableString(input.website) : null,
                    input.country !== undefined ? normalizeNullableString(input.country) : null,
                    input.countryCode !== undefined ? normalizeNullableString(input.countryCode) : null,
                    input.roles !== undefined ? roles ?? [] : null,
                    input.serviceCategories !== undefined
                        ? serviceCategories ?? []
                        : input.serviceTypes !== undefined
                            ? serviceTypes ?? []
                            : null,
                    input.services !== undefined ? services ?? [] : null,
                    input.projectTypes !== undefined ? projectTypes ?? [] : null,
                    input.geographicalCoverage !== undefined ? geographicalCoverage ?? [] : null,
                ]
            );

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }

        return this.getCompanyDetail(companyId, userId);
    }

    async listCompanyOptions(): Promise<{ items: Array<{ id: string; name: string }> }> {
        const sql = `
      SELECT
        c.id,
        COALESCE(
          NULLIF(TRIM(c.display_name), '')
        ) AS name
      FROM companies c
      WHERE COALESCE(c.delete_flag, false) = false
      ORDER BY name ASC
    `;

        const { rows } = await this.db.query(sql);

        return {
            items: rows
                .filter((r) => r.id && r.name)
                .map((r) => ({
                    id: String(r.id),
                    name: String(r.name),
                })),
        };
    }

    async replaceCompanyPermissions(
        companyId: string,
        userId: string,
        permissions: Array<{
            id?: string;
            userId?: string;
            name?: string;
            email?: string;
            role?: string;
            permission?: "creator" | "viewer";
        }>,
        inheritCompanyPermissionsToProjects: boolean
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const accessCheck = await client.query<{
                id: string;
                owner_user_id: string | null;
                user_permission: string | null;
            }>(
                `
            SELECT
                c.id,
                c.owner_user_id,
                (
                    SELECT cu.permission
                    FROM company_users cu
                    WHERE cu.company_id = c.id
                      AND cu.user_id = $2
                      AND COALESCE(cu.delete_flag, false) = false
                    ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                    LIMIT 1
                ) AS user_permission
            FROM companies c
            WHERE c.id = $1
              AND COALESCE(c.delete_flag, false) = false
            LIMIT 1
            `,
                [companyId, userId]
            );

            const existing = accessCheck.rows[0];
            if (!existing) {
                await client.query("ROLLBACK");
                return null;
            }

            const canEdit =
                existing.owner_user_id === userId || existing.user_permission === "creator";

            if (!canEdit) {
                throw new Error("Forbidden");
            }

            const normalized = permissions
                .map((item) => ({
                    userId: String(item.userId ?? item.id ?? '').trim(),
                    role: typeof item.role === 'string' ? item.role.trim() : 'Team Member',
                    permission:
                        item.permission === 'creator' ? 'creator' : 'viewer',
                }))
                .filter((item) => item.userId);

            await client.query(
                `
                UPDATE companies
                SET
                    inherit_company_permissions_to_projects = $2,
                    updated_at = NOW()
                WHERE id = $1
                `,
                [companyId, inheritCompanyPermissionsToProjects]
            );

            await client.query(
                `
            UPDATE company_users
            SET delete_flag = true
            WHERE company_id = $1
              AND user_id <> $2
            `,
                [companyId, existing.owner_user_id]
            );

            for (const item of normalized) {
                if (item.userId === existing.owner_user_id) continue;

                await client.query(
                    `
                INSERT INTO company_users (
                    company_id,
                    user_id,
                    role,
                    permission,
                    delete_flag
                )
                VALUES ($1, $2, $3, $4, false)
                ON CONFLICT (company_id, user_id)
                DO UPDATE SET
                    role = EXCLUDED.role,
                    permission = EXCLUDED.permission,
                    delete_flag = false
                `,
                    [companyId, item.userId, item.role || 'Team Member', item.permission]
                );
            }

            await client.query(
                `
            UPDATE companies
            SET updated_at = NOW()
            WHERE id = $1
            `,
                [companyId]
            );

            await client.query("COMMIT");
            return this.getCompanyDetail(companyId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async upsertCompanyTeamMember(
        companyId: string,
        userId: string,
        member: {
            userId?: string;
            email?: string;
            name?: string;
            role?: string;
            previousUserId?: string;
            previousEmail?: string;
        }
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const accessCheck = await client.query<{
                id: string;
                owner_user_id: string | null;
                user_permission: string | null;
            }>(
                `
            SELECT
                c.id,
                c.owner_user_id,
                (
                    SELECT cu.permission
                    FROM company_users cu
                    WHERE cu.company_id = c.id
                      AND cu.user_id = $2
                      AND COALESCE(cu.delete_flag, false) = false
                    ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                    LIMIT 1
                ) AS user_permission
            FROM companies c
            WHERE c.id = $1
              AND COALESCE(c.delete_flag, false) = false
            LIMIT 1
            `,
                [companyId, userId]
            );

            const existing = accessCheck.rows[0];
            if (!existing) {
                await client.query("ROLLBACK");
                return null;
            }

            const canEdit =
                existing.owner_user_id === userId || existing.user_permission === "creator";

            if (!canEdit) {
                throw new Error("Forbidden");
            }

            let targetUserId = member.userId?.trim() || null;
            const normalizedEmail = member.email?.trim().toLowerCase() || null;
            const normalizedPreviousEmail = member.previousEmail?.trim().toLowerCase() || null;
            const normalizedRole = member.role?.trim() || "Team Member";
            const normalizedPreviousUserId = member.previousUserId?.trim() || null;

            if (!targetUserId && normalizedEmail) {
                const lookup = await client.query<{
                    id: string;
                    name: string | null;
                    email: string | null;
                }>(
                    `
                SELECT u.id, u.name, u.email
                FROM users_new u
                WHERE LOWER(u.email) = $1
                LIMIT 1
                `,
                    [normalizedEmail]
                );

                targetUserId = lookup.rows[0]?.id ?? null;
            }

            if (!targetUserId) {
                throw new Error("Team member userId or resolvable email is required");
            }

            if (targetUserId === existing.owner_user_id) {
                throw new Error("Owner membership cannot be modified here");
            }

            // If the edit changed identity, deactivate the old membership first.
            if (normalizedPreviousUserId && normalizedPreviousUserId !== targetUserId) {
                await client.query(
                    `
                UPDATE company_users
                SET delete_flag = true,
                    updated_at = NOW()
                WHERE company_id = $1
                  AND user_id = $2
                  AND permission <> 'creator'
                `,
                    [companyId, normalizedPreviousUserId]
                );
            } else if (
                !normalizedPreviousUserId &&
                normalizedPreviousEmail &&
                normalizedPreviousEmail !== normalizedEmail
            ) {
                await client.query(
                    `
                UPDATE company_users cu
                SET delete_flag = true,
                    updated_at = NOW()
                WHERE cu.company_id = $1
                  AND COALESCE(cu.delete_flag, false) = false
                  AND cu.permission <> 'creator'
                  AND EXISTS (
                      SELECT 1
                      FROM users_new u
                      WHERE u.id = cu.user_id
                        AND LOWER(u.email) = $2
                  )
                `,
                    [companyId, normalizedPreviousEmail]
                );
            }

            await client.query(
                `
            INSERT INTO company_users (
                company_id,
                user_id,
                role,
                permission,
                delete_flag
            )
            VALUES ($1, $2, $3, 'viewer', false)
            ON CONFLICT (company_id, user_id)
            DO UPDATE SET
                role = EXCLUDED.role,
                delete_flag = false,
                updated_at = NOW()
            `,
                [companyId, targetUserId, normalizedRole]
            );

            await client.query(
                `
            UPDATE companies
            SET updated_at = NOW()
            WHERE id = $1
            `,
                [companyId]
            );

            await client.query("COMMIT");
            return this.getCompanyDetail(companyId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async removeCompanyTeamMember(
        companyId: string,
        userId: string,
        input: {
            userId?: string;
            email?: string;
        }
    ): Promise<CompanyDetailResult | null> {

        if (!input.userId && !input.email) {
            throw new Error("userId or email is required to remove team member");
        }

        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const access = await client.query(
                `
            SELECT c.id, c.owner_user_id,
                   (
                     SELECT cu.permission
                     FROM company_users cu
                     WHERE cu.company_id = c.id
                       AND cu.user_id = $2
                       AND COALESCE(cu.delete_flag, false) = false
                     ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                     LIMIT 1
                   ) AS user_permission
            FROM companies c
            WHERE c.id = $1
              AND COALESCE(c.delete_flag, false) = false
            LIMIT 1
            `,
                [companyId, userId]
            );

            const row = access.rows[0];
            if (!row) {
                await client.query("ROLLBACK");
                return null;
            }

            const canEdit = row.owner_user_id === userId || row.user_permission === "creator";
            if (!canEdit) throw new Error("Forbidden");

            if (input.userId) {
                await client.query(
                    `
                UPDATE company_users
                SET delete_flag = true, updated_at = NOW()
                WHERE company_id = $1
                  AND user_id = $2
                  AND permission <> 'creator'
                `,
                    [companyId, input.userId]
                );
            } else if (input.email) {
                await client.query(
                    `
                UPDATE company_users cu
                SET delete_flag = true, updated_at = NOW()
                WHERE cu.company_id = $1
                  AND COALESCE(cu.delete_flag, false) = false
                  AND cu.permission <> 'creator'
                  AND EXISTS (
                    SELECT 1
                    FROM users_new u
                    WHERE u.id = cu.user_id
                      AND LOWER(u.email) = LOWER($2)
                  )
                `,
                    [companyId, input.email]
                );
            }

            await client.query("COMMIT");
            return await this.getCompanyDetail(companyId, userId);
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    private async getCompanyPrivacyMap(
        companyId: string,
        client: Pool | { query: Pool["query"] } = this.db
    ): Promise<CompanyPrivacyMap> {
        const privacy = defaultCompanyPrivacy();

        const { rows } = await client.query<{
            section_key: string;
            visibility: CompanyPrivacyLevel;
        }>(
            `
        SELECT section_key, visibility
        FROM company_section_privacy
        WHERE company_id = $1
        `,
            [companyId]
        );

        for (const row of rows) {
            const key = normalizeCompanySectionKey(row.section_key);
            if (!key) continue;
            privacy[key] = row.visibility === "company_users" ? "company_users" : "public";
        }

        return privacy;
    }

    async updateCompanySectionPrivacy(
        companyId: string,
        userId: string,
        rawInput: Record<string, unknown>
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const accessCheck = await client.query<{
                id: string;
                owner_user_id: string | null;
                user_permission: string | null;
            }>(
                `
            SELECT
                c.id,
                c.owner_user_id,
                (
                    SELECT cu.permission
                    FROM company_users cu
                    WHERE cu.company_id = c.id
                      AND cu.user_id = $2
                      AND COALESCE(cu.delete_flag, false) = false
                    ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                    LIMIT 1
                ) AS user_permission
            FROM companies c
            WHERE c.id = $1
              AND COALESCE(c.delete_flag, false) = false
            LIMIT 1
            `,
                [companyId, userId]
            );

            const existing = accessCheck.rows[0];
            if (!existing) {
                await client.query("ROLLBACK");
                return null;
            }

            const canEdit =
                existing.owner_user_id === userId || existing.user_permission === "creator";

            if (!canEdit) {
                throw new Error("Forbidden");
            }

            const rawSectionKey =
                typeof rawInput.sectionKey === "string" ? rawInput.sectionKey : "";
            const rawVisibility =
                typeof rawInput.visibility === "string" ? rawInput.visibility : "";

            const key = normalizeCompanySectionKey(rawSectionKey);
            if (!key) {
                throw new Error(`Invalid company section key: ${rawSectionKey}`);
            }

            const visibility =
                rawVisibility === "company_users" ||
                    rawVisibility === "hidden" ||
                    rawVisibility === "private"
                    ? "company_users"
                    : "public";

            const defaults = defaultCompanyPrivacy();

            if (visibility === defaults[key]) {
                await client.query(
                    `
                DELETE FROM company_section_privacy
                WHERE company_id = $1
                  AND section_key = $2
                `,
                    [companyId, key]
                );
            } else {
                await client.query(
                    `
                INSERT INTO company_section_privacy (
                    company_id,
                    section_key,
                    visibility,
                    updated_at
                )
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (company_id, section_key)
                DO UPDATE SET
                    visibility = EXCLUDED.visibility,
                    updated_at = NOW()
                `,
                    [companyId, key, visibility]
                );
            }

            await client.query(
                `
            UPDATE companies
            SET updated_at = NOW()
            WHERE id = $1
            `,
                [companyId]
            );

            await client.query("COMMIT");
            return this.getCompanyDetail(companyId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    private buildCompanyInviteUrl(token: string): string {
        const baseUrl =
            process.env.FRONTEND_BASE_URL?.trim() ||
            "http://localhost:5173";

        return `${baseUrl.replace(/\/+$/, "")}/signup?companyInvite=${encodeURIComponent(token)}`;
    }

    private generateInviteToken(): string {
        return crypto.randomBytes(32).toString("base64url");
    }

    private async assertCanEditCompany(
        companyId: string,
        userId: string,
        client: Pool | { query: Pool["query"] } = this.db
    ): Promise<{ ownerUserId: string | null }> {
        const accessCheck = await client.query<{
            id: string;
            owner_user_id: string | null;
            user_permission: string | null;
        }>(
            `
        SELECT
            c.id,
            c.owner_user_id,
            (
                SELECT cu.permission
                FROM company_users cu
                WHERE cu.company_id = c.id
                  AND cu.user_id = $2
                  AND COALESCE(cu.delete_flag, false) = false
                ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                LIMIT 1
            ) AS user_permission
        FROM companies c
        WHERE c.id = $1
          AND COALESCE(c.delete_flag, false) = false
        LIMIT 1
        `,
            [companyId, userId]
        );

        const existing = accessCheck.rows[0];
        if (!existing) {
            throw new Error("Company not found");
        }

        const canEdit =
            existing.owner_user_id === userId || existing.user_permission === "creator";

        if (!canEdit) {
            throw new Error("Forbidden");
        }

        return { ownerUserId: existing.owner_user_id };
    }

    async createCompanyMedia(
        companyId: string,
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
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            if (input.isCover) {
                await client.query(
                    `
                UPDATE company_media
                SET is_cover = false
                WHERE company_id = $1
                  AND kind <> 'logo'
                `,
                    [companyId]
                );
            }

            await client.query(
                `
            INSERT INTO company_media (
                company_id,
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
                    companyId,
                    (input.kind?.trim() || "gallery"),
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
                `UPDATE companies SET updated_at = NOW() WHERE id = $1`,
                [companyId]
            );

            await client.query("COMMIT");
            return this.getCompanyDetail(companyId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateCompanyMedia(
        companyId: string,
        mediaId: string,
        userId: string,
        input: {
            caption?: string | null;
            isCover?: boolean;
        }
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            const existing = await client.query<{
                id: string;
                metadata: Record<string, unknown> | null;
            }>(
                `
            SELECT id, metadata
            FROM company_media
            WHERE id = $1
              AND company_id = $2
              AND kind <> 'logo'
            LIMIT 1
            `,
                [mediaId, companyId]
            );

            const row = existing.rows[0];
            if (!row) {
                throw new Error("Media not found");
            }

            if (input.isCover) {
                await client.query(
                    `
                UPDATE company_media
                SET is_cover = false
                WHERE company_id = $1
                  AND kind <> 'logo'
                `,
                    [companyId]
                );
            }

            const nextMetadata = {
                ...(row.metadata ?? {}),
                ...(input.caption !== undefined ? { caption: input.caption?.trim() || null } : {}),
            };

            await client.query(
                `
            UPDATE company_media
            SET
                metadata = $3::jsonb,
                is_cover = COALESCE($4, is_cover)
            WHERE id = $1
              AND company_id = $2
            `,
                [
                    mediaId,
                    companyId,
                    JSON.stringify(nextMetadata),
                    input.isCover ?? null,
                ]
            );

            await client.query(
                `UPDATE companies SET updated_at = NOW() WHERE id = $1`,
                [companyId]
            );

            await client.query("COMMIT");
            return this.getCompanyDetail(companyId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteCompanyMedia(
        companyId: string,
        mediaId: string,
        userId: string
    ): Promise<{ s3Key: string | null; company: CompanyDetailResult | null }> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            const existing = await client.query<{ s3_key: string | null }>(
                `
            DELETE FROM company_media
            WHERE id = $1
              AND company_id = $2
              AND kind <> 'logo'
            RETURNING s3_key
            `,
                [mediaId, companyId]
            );

            const row = existing.rows[0];
            if (!row) {
                throw new Error("Media not found");
            }

            await client.query(
                `UPDATE companies SET updated_at = NOW() WHERE id = $1`,
                [companyId]
            );

            await client.query("COMMIT");
            return {
                s3Key: row.s3_key,
                company: await this.getCompanyDetail(companyId, userId),
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async createCompanyDocument(
        companyId: string,
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
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            await client.query(
                `
            INSERT INTO company_documents (
                company_id,
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
                    companyId,
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
                `UPDATE companies SET updated_at = NOW() WHERE id = $1`,
                [companyId]
            );

            await client.query("COMMIT");
            return this.getCompanyDetail(companyId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateCompanyDocument(
        companyId: string,
        documentId: string,
        userId: string,
        input: {
            name?: string | null;
            type?: string | null;
        }
    ): Promise<CompanyDetailResult | null> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            const existing = await client.query<{
                id: string;
                metadata: Record<string, unknown> | null;
            }>(
                `
            SELECT id, metadata
            FROM company_documents
            WHERE id = $1
              AND company_id = $2
            LIMIT 1
            `,
                [documentId, companyId]
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
            UPDATE company_documents
            SET metadata = $3::jsonb
            WHERE id = $1
              AND company_id = $2
            `,
                [
                    documentId,
                    companyId,
                    JSON.stringify(nextMetadata),
                ]
            );

            await client.query(
                `UPDATE companies SET updated_at = NOW() WHERE id = $1`,
                [companyId]
            );

            await client.query("COMMIT");
            return this.getCompanyDetail(companyId, userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteCompanyDocument(
        companyId: string,
        documentId: string,
        userId: string
    ): Promise<{ s3Key: string | null; company: CompanyDetailResult | null }> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            const existing = await client.query<{ s3_key: string | null }>(
                `
            DELETE FROM company_documents
            WHERE id = $1
              AND company_id = $2
            RETURNING s3_key
            `,
                [documentId, companyId]
            );

            const row = existing.rows[0];
            if (!row) {
                throw new Error("Document not found");
            }

            await client.query(
                `UPDATE companies SET updated_at = NOW() WHERE id = $1`,
                [companyId]
            );

            await client.query("COMMIT");
            return {
                s3Key: row.s3_key,
                company: await this.getCompanyDetail(companyId, userId),
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    private async assertCanManageCompany(
        client: Pool | { query: Pool["query"] },
        companyId: string,
        userId: string
    ): Promise<void> {
        const accessCheck = await client.query<{
            id: string;
            owner_user_id: string | null;
            user_permission: string | null;
        }>(
            `
        SELECT
            c.id,
            c.owner_user_id,
            (
                SELECT cu.permission
                FROM company_users cu
                WHERE cu.company_id = c.id
                  AND cu.user_id = $2
                  AND COALESCE(cu.delete_flag, false) = false
                ORDER BY CASE cu.permission WHEN 'creator' THEN 1 ELSE 2 END
                LIMIT 1
            ) AS user_permission
        FROM companies c
        WHERE c.id = $1
          AND COALESCE(c.delete_flag, false) = false
        LIMIT 1
        `,
            [companyId, userId]
        );

        const row = accessCheck.rows[0];
        if (!row) {
            throw new Error("Company not found");
        }

        const canManage =
            row.owner_user_id === userId || row.user_permission === "creator";

        if (!canManage) {
            throw new Error("Forbidden");
        }
    }

    private async insertCompanyInviteEvent(
        client: Pool | { query: Pool["query"] },
        input: {
            inviteLinkId: string;
            companyId: string;
            eventType: CompanyInviteEventType;
            invitedUserId?: string | null;
            email?: string | null;
            sessionKey?: string | null;
            ipAddress?: string | null;
            userAgent?: string | null;
            referrer?: string | null;
            metadata?: Record<string, unknown>;
        }
    ): Promise<void> {
        await client.query(
            `
        INSERT INTO company_invite_events (
            invite_link_id,
            company_id,
            event_type,
            invited_user_id,
            email,
            session_key,
            ip_address,
            user_agent,
            referrer,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9, $10::jsonb)
        `,
            [
                input.inviteLinkId,
                input.companyId,
                input.eventType,
                input.invitedUserId ?? null,
                input.email ?? null,
                input.sessionKey ?? null,
                input.ipAddress ?? null,
                input.userAgent ?? null,
                input.referrer ?? null,
                JSON.stringify(input.metadata ?? {}),
            ]
        );
    }

    async getOrCreateCompanyInviteLink(
        companyId: string,
        userId: string
    ): Promise<CompanyInviteLinkResponse> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            await this.assertCanManageCompany(client, companyId, userId);

            const existing = await client.query<CompanyInviteLinkRow>(
                `
            SELECT *
            FROM company_invite_links
            WHERE company_id = $1
              AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
            `,
                [companyId]
            );

            let row = existing.rows[0];

            if (!row) {
                const token = this.generateInviteToken();

                const created = await client.query<CompanyInviteLinkRow>(
                    `
                INSERT INTO company_invite_links (
                    company_id,
                    token,
                    created_by_user_id,
                    is_active
                )
                VALUES ($1, $2, $3, true)
                RETURNING *
                `,
                    [companyId, token, userId]
                );

                row = created.rows[0];
                if (!row) {
                    throw new Error("Failed to create company invite link");
                }

                await this.insertCompanyInviteEvent(client, {
                    inviteLinkId: row.id,
                    companyId,
                    eventType: "link_created",
                    invitedUserId: null,
                    metadata: {
                        createdByUserId: userId,
                    },
                });
            }

            await client.query(
                `
            UPDATE companies
            SET updated_at = NOW()
            WHERE id = $1
            `,
                [companyId]
            );

            await client.query("COMMIT");

            return {
                inviteLinkId: row.id,
                companyId: row.company_id,
                token: row.token,
                isActive: row.is_active,
                externalInviteUrl: this.buildCompanyInviteUrl(row.token),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteCompany(companyId: string, userId: string): Promise<boolean> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            await this.assertCanEditCompany(companyId, userId, client);

            const deleted = await client.query<{ id: string }>(
                `
            UPDATE companies
            SET
                delete_flag = true,
                updated_at = NOW()
            WHERE id = $1
              AND COALESCE(delete_flag, false) = false
            RETURNING id
            `,
                [companyId]
            );

            if (!deleted.rows[0]) {
                await client.query("ROLLBACK");
                return false;
            }

            await client.query(
                `
            UPDATE company_users
            SET
                delete_flag = true,
                updated_at = NOW()
            WHERE company_id = $1
            `,
                [companyId]
            );

            await client.query(
                `
            UPDATE company_invite_links
            SET
                is_active = false,
                updated_at = NOW()
            WHERE company_id = $1
            `,
                [companyId]
            );

            await client.query(
                `
            DELETE FROM user_saved_items
            WHERE entity_type = 'company'
              AND entity_id = $1
            `,
                [companyId]
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