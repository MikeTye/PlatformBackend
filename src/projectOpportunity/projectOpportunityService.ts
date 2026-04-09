import type { Pool } from "pg";
import type {
    CreateProjectOpportunityBody,
    UpdateProjectOpportunityBody,
} from "./schema.js";

const MAX_PROJECT_OPPORTUNITY_ITEMS = 10;

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

export type ProjectOpportunityItem = {
    id: string;
    projectId: string;
    type: string;
    description: string | null;
    urgent: boolean;
    sortOrder: number;
    isActive: boolean;
};

export type RecentProjectOpportunityListItem = {
    id: string;
    projectId: string;
    projectName: string;
    projectUpid: string | null;
    type: string;
    description: string | null;
    urgent: boolean;
    stage: string | null;
    country: string | null;
    developer: string | null;
    createdAt: string;
};

export type ListProjectOpportunitiesResult = {
    items: RecentProjectOpportunityListItem[];
};

export class ProjectOpportunityService {
    constructor(private readonly db: Pool) { }

    private normalizeInput(
        input: CreateProjectOpportunityBody | UpdateProjectOpportunityBody,
    ) {
        return {
            type: typeof input.type === "string" ? input.type.trim() : undefined,
            description:
                input.description === undefined ? undefined : (input.description?.trim() || null),
            urgent: input.urgent === undefined ? undefined : Boolean(input.urgent),
            isActive: input.isActive === undefined ? undefined : Boolean(input.isActive),
        };
    }

    private mapProjectOpportunity(row: ProjectOpportunityRecord): ProjectOpportunityItem {
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

    private async assertOpportunityLimitNotReached(projectId: string): Promise<void> {
        const countRes = await this.db.query<{ total: string }>(
            `
            SELECT COUNT(*)::text AS total
            FROM project_opportunities
            WHERE project_id = $1
              AND COALESCE(delete_flag, false) = false
            `,
            [projectId],
        );

        const total = Number(countRes.rows[0]?.total ?? 0);
        if (total >= MAX_PROJECT_OPPORTUNITY_ITEMS) {
            const err = new Error(`Project opportunity limit reached. Maximum ${MAX_PROJECT_OPPORTUNITY_ITEMS} items allowed.`);
            (err as any).statusCode = 409;
            throw err;
        }
    }

    private async assertCanEditProject(
        projectId: string,
        userId: string,
        client: Pool | { query: Pool["query"] } = this.db,
    ): Promise<void> {
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
            [projectId, userId],
        );

        const existing = accessCheck.rows[0];
        if (!existing) {
            const err = new Error("Project not found");
            (err as any).statusCode = 404;
            throw err;
        }

        const canEdit =
            existing.owner_user_id === userId || existing.user_permission === "creator";

        if (!canEdit) {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }
    }

    private async assertCanReadProject(projectId: string, userId: string): Promise<void> {
        const accessCheck = await this.db.query<{
            id: string;
            owner_user_id: string | null;
            visibility: string | null;
            has_membership: boolean;
        }>(
            `
      SELECT
        p.id,
        p.owner_user_id,
        p.visibility,
        EXISTS (
          SELECT 1
          FROM project_users pu
          WHERE pu.project_id = p.id
            AND pu.member_type = 'user'
            AND pu.member_user_id = $2
            AND COALESCE(pu.delete_flag, false) = false
        ) AS has_membership
      FROM projects p
      WHERE p.id = $1
        AND COALESCE(p.delete_flag, false) = false
      LIMIT 1
      `,
            [projectId, userId],
        );

        const existing = accessCheck.rows[0];
        if (!existing) {
            const err = new Error("Project not found");
            (err as any).statusCode = 404;
            throw err;
        }

        const canRead =
            existing.owner_user_id === userId ||
            existing.has_membership ||
            String(existing.visibility ?? "").toLowerCase() === "public";

        if (!canRead) {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }
    }

    async listByProject(projectId: string, currentUserId: string) {
        await this.assertCanReadProject(projectId, currentUserId);

        const res = await this.db.query<ProjectOpportunityRecord>(
            `
      SELECT
        id,
        project_id,
        opportunity_type,
        description,
        is_priority,
        sort_order,
        is_active,
        created_at
      FROM project_opportunities
      WHERE project_id = $1
        AND COALESCE(delete_flag, false) = false
      ORDER BY sort_order ASC, created_at ASC
      `,
            [projectId],
        );

        return {
            items: res.rows.map((row) => this.mapProjectOpportunity(row)),
        };
    }

    async listRecent(
        currentUserId: string,
        input?: { limit?: number },
    ): Promise<ListProjectOpportunitiesResult> {
        const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);

        const res = await this.db.query<{
            id: string;
            project_id: string;
            project_name: string;
            project_upid: string | null;
            opportunity_type: string;
            description: string | null;
            is_priority: boolean | null;
            stage: string | null;
            host_country: string | null;
            developer_name: string | null;
            created_at: string;
        }>(
            `
      SELECT
        po.id,
        po.project_id,
        p.name AS project_name,
        p.upid AS project_upid,
        po.opportunity_type,
        po.description,
        po.is_priority,
        p.stage,
        p.host_country,
        c.display_name AS developer_name,
        po.created_at
      FROM project_opportunities po
      INNER JOIN projects p
        ON p.id = po.project_id
       AND COALESCE(p.delete_flag, false) = false
      LEFT JOIN companies c
        ON c.id = p.company_id
       AND COALESCE(c.delete_flag, false) = false
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
            [currentUserId, limit],
        );

        return {
            items: res.rows.map((row) => ({
                id: row.id,
                projectId: row.project_id,
                projectName: row.project_name,
                projectUpid: row.project_upid ?? null,
                type: row.opportunity_type,
                description: row.description ?? null,
                urgent: Boolean(row.is_priority),
                stage: row.stage ?? null,
                country: row.host_country ?? null,
                developer: row.developer_name ?? null,
                createdAt: row.created_at,
            })),
        };
    }

    async create(
        projectId: string,
        currentUserId: string,
        input: CreateProjectOpportunityBody,
    ) {
        await this.assertCanEditProject(projectId, currentUserId);
        await this.assertOpportunityLimitNotReached(projectId);

        const normalized = this.normalizeInput(input);
        if (!normalized.type) {
            const err = new Error("Opportunity type is required");
            (err as any).statusCode = 400;
            throw err;
        }

        const sortOrderRes = await this.db.query<{ next_sort_order: number }>(
            `
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
      FROM project_opportunities
      WHERE project_id = $1
        AND COALESCE(delete_flag, false) = false
      `,
            [projectId],
        );

        const nextSortOrder = Number(sortOrderRes.rows[0]?.next_sort_order ?? 0);

        const insertRes = await this.db.query<ProjectOpportunityRecord>(
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
      RETURNING
        id,
        project_id,
        opportunity_type,
        description,
        is_priority,
        sort_order,
        is_active,
        created_at
      `,
            [
                projectId,
                normalized.type,
                normalized.description ?? null,
                normalized.urgent ?? false,
                nextSortOrder,
                currentUserId,
            ],
        );

        const row = insertRes.rows[0];
        return row ? this.mapProjectOpportunity(row) : null;
    }

    async update(
        opportunityId: string,
        currentUserId: string,
        input: UpdateProjectOpportunityBody,
    ) {
        const existingRes = await this.db.query<{
            id: string;
            project_id: string;
            opportunity_type: string;
            description: string | null;
            is_priority: boolean;
            sort_order: number;
            is_active: boolean;
            delete_flag: boolean;
        }>(
            `
      SELECT
        id,
        project_id,
        opportunity_type,
        description,
        is_priority,
        sort_order,
        is_active,
        delete_flag
      FROM project_opportunities
      WHERE id = $1
      LIMIT 1
      `,
            [opportunityId],
        );

        const existing = existingRes.rows[0];
        if (!existing || existing.delete_flag) {
            return null;
        }

        await this.assertCanEditProject(existing.project_id, currentUserId);

        const targetProjectId = input.projectId?.trim() || existing.project_id;
        if (targetProjectId !== existing.project_id) {
            await this.assertCanEditProject(targetProjectId, currentUserId);
        }

        const normalized = this.normalizeInput(input);
        const updateFields: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        const set = (column: string, value: unknown) => {
            updateFields.push(`${column} = $${i++}`);
            values.push(value);
        };

        if (targetProjectId !== existing.project_id) {
            const sortOrderRes = await this.db.query<{ next_sort_order: number }>(
                `
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
        FROM project_opportunities
        WHERE project_id = $1
          AND COALESCE(delete_flag, false) = false
          AND id <> $2
        `,
                [targetProjectId, opportunityId],
            );

            set("project_id", targetProjectId);
            set("sort_order", Number(sortOrderRes.rows[0]?.next_sort_order ?? 0));
        }

        if (normalized.type !== undefined) {
            if (!normalized.type) {
                const err = new Error("Opportunity type is required");
                (err as any).statusCode = 400;
                throw err;
            }
            set("opportunity_type", normalized.type);
        }

        if (normalized.description !== undefined) set("description", normalized.description);
        if (normalized.urgent !== undefined) set("is_priority", normalized.urgent);
        if (normalized.isActive !== undefined) set("is_active", normalized.isActive);

        set("updated_by", currentUserId);
        updateFields.push(`updated_at = now()`);

        values.push(opportunityId);

        const updateRes = await this.db.query<ProjectOpportunityRecord>(
            `
      UPDATE project_opportunities
      SET ${updateFields.join(", ")}
      WHERE id = $${i}
      RETURNING
        id,
        project_id,
        opportunity_type,
        description,
        is_priority,
        sort_order,
        is_active,
        created_at
      `,
            values,
        );

        const row = updateRes.rows[0];
        return row ? this.mapProjectOpportunity(row) : null;
    }

    async remove(opportunityId: string, currentUserId: string): Promise<boolean> {
        const existingRes = await this.db.query<{
            id: string;
            project_id: string;
            delete_flag: boolean;
        }>(
            `
      SELECT id, project_id, delete_flag
      FROM project_opportunities
      WHERE id = $1
      LIMIT 1
      `,
            [opportunityId],
        );

        const existing = existingRes.rows[0];
        if (!existing || existing.delete_flag) {
            return false;
        }

        await this.assertCanEditProject(existing.project_id, currentUserId);

        const client = await this.db.connect();
        try {
            await client.query("BEGIN");

            const result = await client.query(
                `
        UPDATE project_opportunities
        SET
          delete_flag = true,
          deleted_at = now(),
          updated_at = now(),
          updated_by = $2
        WHERE id = $1
          AND COALESCE(delete_flag, false) = false
        `,
                [opportunityId, currentUserId],
            );

            if ((result.rowCount ?? 0) > 0) {
                await client.query(
                    `
          DELETE FROM user_saved_items
          WHERE entity_type = 'opportunity'
            AND entity_id = $1
          `,
                    [opportunityId],
                );
            }

            await client.query("COMMIT");
            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}