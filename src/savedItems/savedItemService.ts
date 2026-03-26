import type { Pool } from "pg";
import type { SaveItemInput, SavedEntityType } from "./schema.js";

type SaveItemRow = {
    id: string;
    user_id: string;
    entity_type: SavedEntityType;
    entity_id: string;
    created_at: string;
};

type ListSavedItemsResult = {
    projects: Array<{
        entityType: "project";
        savedAt: string;
        project: {
            id: string;
            upid: string | null;
            name: string;
            developer: string;
            description: string | null;
            stage: string;
            type: string;
            country: string | null;
            countryCode: string | null;
            hectares: number | null;
            expectedCredits: string | null;
            freshness: null;
            verifiedFields: number;
            totalFields: number;
            photoUrl: string | null;
            isMine: boolean;
        };
    }>;
    companies: Array<{
        entityType: "company";
        savedAt: string;
        company: {
            id: string;
            name: string;
            type: "Project Developer" | "Service Provider";
            description: string;
            country: string;
            countryCode: string;
            logoUrl: string | null;
            isMine: boolean;
            isVerified: boolean;
            projectsCount: number;
            servicesCount: number;
            serviceTypes: string[];
            certifications: string[];
        };
    }>;
    opportunities: Array<never>;
};

export class SavedItemService {
    constructor(private readonly db: Pool) {}

    private async assertEntityExists(
        entityType: SavedEntityType,
        entityId: string
    ): Promise<void> {
        if (entityType === "project") {
            const result = await this.db.query<{ id: string }>(
                `
                SELECT id
                FROM projects
                WHERE id = $1
                  AND COALESCE(delete_flag, false) = false
                LIMIT 1
                `,
                [entityId]
            );

            if (!result.rows[0]) {
                throw new Error("Project not found");
            }

            return;
        }

        if (entityType === "company") {
            const result = await this.db.query<{ id: string }>(
                `
                SELECT id
                FROM companies
                WHERE id = $1
                  AND COALESCE(delete_flag, false) = false
                LIMIT 1
                `,
                [entityId]
            );

            if (!result.rows[0]) {
                throw new Error("Company not found");
            }
        }
    }

    async listSavedItems(
        userId: string,
        entityType: "all" | "project" | "company" | "opportunity" = "all"
    ): Promise<ListSavedItemsResult> {
        const result: ListSavedItemsResult = {
            projects: [],
            companies: [],
            opportunities: [],
        };

        if (entityType === "all" || entityType === "project") {
            const projectsRes = await this.db.query(
                `
                SELECT
                    usi.created_at AS saved_at,
                    p.id,
                    p.upid,
                    COALESCE(NULLIF(TRIM(p.name), ''), 'Untitled Project') AS name,
                    COALESCE(c.legal_name, 'Unknown Developer') AS developer,
                    p.description,
                    p.stage,
                    p.project_type AS type,
                    p.host_country AS country,
                    p.host_country_code AS country_code,
                    NULL::text AS expected_credits,
                    NULL::text AS photo_url,
                    (p.owner_user_id = $1) AS is_mine
                FROM user_saved_items usi
                INNER JOIN projects p
                    ON p.id = usi.entity_id
                LEFT JOIN companies c
                    ON c.id = p.company_id
                   AND COALESCE(c.delete_flag, false) = false
                WHERE usi.user_id = $1
                  AND usi.entity_type = 'project'
                  AND COALESCE(p.delete_flag, false) = false
                ORDER BY usi.created_at DESC
                `,
                [userId]
            );

            result.projects = projectsRes.rows.map((row: any) => ({
                entityType: "project",
                savedAt: row.saved_at,
                project: {
                    id: row.id,
                    upid: row.upid,
                    name: row.name,
                    developer: row.developer,
                    description: row.description,
                    stage: row.stage,
                    type: row.type,
                    country: row.country,
                    countryCode: row.country_code,
                    hectares: row.hectares,
                    expectedCredits: row.expected_credits,
                    freshness: null,
                    verifiedFields: 0,
                    totalFields: 0,
                    photoUrl: row.photo_url,
                    isMine: row.is_mine,
                },
            }));
        }

        if (entityType === "all" || entityType === "company") {
            const companiesRes = await this.db.query(
                `
                SELECT
                    usi.created_at AS saved_at,
                    c.id,
                    c.legal_name,
                    COALESCE(c.function_description, '') AS description,
                    COALESCE(c.primary_country, '') AS country,
                    COALESCE(c.country_code, '') AS country_code,
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM projects p2
                            WHERE p2.company_id = c.id
                              AND COALESCE(p2.delete_flag, false) = false
                        ) THEN 'Project Developer'
                        ELSE 'Service Provider'
                    END AS type,
                    NULL::text AS logo_url,
                    (c.owner_user_id = $1) AS is_mine,
                    false AS is_verified,
                    (
                        SELECT COUNT(*)
                        FROM projects p3
                        WHERE p3.company_id = c.id
                          AND COALESCE(p3.delete_flag, false) = false
                    )::int AS projects_count
                FROM user_saved_items usi
                INNER JOIN companies c
                    ON c.id = usi.entity_id
                WHERE usi.user_id = $1
                  AND usi.entity_type = 'company'
                  AND COALESCE(c.delete_flag, false) = false
                ORDER BY usi.created_at DESC
                `,
                [userId]
            );

            result.companies = companiesRes.rows.map((row: any) => ({
                entityType: "company",
                savedAt: row.saved_at,
                company: {
                    id: row.id,
                    name: row.legal_name,
                    type: row.type,
                    description: row.description,
                    country: row.country,
                    countryCode: row.country_code,
                    logoUrl: row.logo_url,
                    isMine: row.is_mine,
                    isVerified: row.is_verified,
                    projectsCount: row.projects_count,
                    servicesCount: 0,
                    serviceTypes: [],
                    certifications: [],
                },
            }));
        }

        return result;
    }

    async saveItem(userId: string, input: SaveItemInput): Promise<SaveItemRow> {
        await this.assertEntityExists(input.entityType, input.entityId);

        const result = await this.db.query<SaveItemRow>(
            `
            INSERT INTO user_saved_items (
                user_id,
                entity_type,
                entity_id
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, entity_type, entity_id)
            DO UPDATE
                SET created_at = user_saved_items.created_at
            RETURNING *
            `,
            [userId, input.entityType, input.entityId]
        );

        const row = result.rows[0];

        if (!row) {
            throw new Error("Save item returned no rows");
        }

        return row;
    }

    async removeSavedItem(
        userId: string,
        entityType: SavedEntityType,
        entityId: string
    ): Promise<boolean> {
        const result = await this.db.query(
            `
            DELETE FROM user_saved_items
            WHERE user_id = $1
              AND entity_type = $2
              AND entity_id = $3
            `,
            [userId, entityType, entityId]
        );

        return (result.rowCount ?? 0) > 0;
    }
}