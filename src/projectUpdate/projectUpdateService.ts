import type { Pool } from "pg";
import type {
    CreateProjectUpdateBody,
    UpdateProjectUpdateBody,
} from "./schema.js";

type ProjectUpdateRecord = {
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    update_date: string | null;
    author_name: string | null;
    update_type: "progress" | "stage" | null;
    sort_order: number;
    is_active: boolean;
    created_at: string;
};

export type ProjectUpdateItem = {
    id: string;
    projectId: string;
    title: string;
    description: string | null;
    dateLabel: string | null;
    authorName: string | null;
    type: "progress" | "stage";
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
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

export class ProjectUpdateService {
    constructor(private readonly db: Pool) { }

    private normalizeDate(value?: string | null) {
        const trimmed = value?.trim() || null;
        if (!trimmed) return null;
        return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
    }

    private mapProjectUpdate(row: ProjectUpdateRecord): ProjectUpdateItem {
        return {
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            description: row.description ?? null,
            dateLabel: row.update_date
                ? new Date(row.update_date).toISOString().slice(0, 10)
                : null,
            authorName: row.author_name ?? null,
            type: row.update_type === "stage" ? "stage" : "progress",
            sortOrder: Number(row.sort_order ?? 0),
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
        };
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

        const res = await this.db.query<ProjectUpdateRecord>(
            `
      SELECT
        id,
        project_id,
        title,
        description,
        update_date,
        author_name,
        update_type,
        sort_order,
        is_active,
        created_at
      FROM project_updates
      WHERE project_id = $1
        AND COALESCE(delete_flag, false) = false
      ORDER BY sort_order ASC, update_date DESC NULLS LAST, created_at DESC
      `,
            [projectId],
        );

        return {
            items: res.rows.map((row) => this.mapProjectUpdate(row)),
        };
    }

    async listRecent(
        currentUserId: string,
        input?: { limit?: number },
    ): Promise<ListProjectUpdatesResult> {
        const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);

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
      ORDER BY pu.update_date DESC NULLS LAST, pu.created_at DESC
      LIMIT $2
      `,
            [currentUserId, limit],
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

    async create(projectId: string, currentUserId: string, input: CreateProjectUpdateBody) {
        await this.assertCanEditProject(projectId, currentUserId);

        const sortOrderRes = await this.db.query<{ next_sort_order: number }>(
            `
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
      FROM project_updates
      WHERE project_id = $1
        AND COALESCE(delete_flag, false) = false
      `,
            [projectId],
        );

        const nextSortOrder = Number(sortOrderRes.rows[0]?.next_sort_order ?? 0);

        const insertRes = await this.db.query<ProjectUpdateRecord>(
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
        project_id,
        title,
        description,
        update_date,
        author_name,
        update_type,
        sort_order,
        is_active,
        created_at
      `,
            [
                projectId,
                input.title.trim(),
                input.description?.trim() || null,
                this.normalizeDate(input.dateLabel),
                input.authorName?.trim() || null,
                input.type === "stage" ? "stage" : "progress",
                nextSortOrder,
                currentUserId,
            ],
        );

        const row = insertRes.rows[0];
        return row ? this.mapProjectUpdate(row) : null;
    }

    async update(updateId: string, currentUserId: string, input: UpdateProjectUpdateBody) {
        const existingRes = await this.db.query<{
            id: string;
            project_id: string;
            title: string;
            description: string | null;
            update_date: string | null;
            author_name: string | null;
            update_type: "progress" | "stage" | null;
            sort_order: number;
            is_active: boolean;
            delete_flag: boolean;
        }>(
            `
      SELECT
        id,
        project_id,
        title,
        description,
        update_date,
        author_name,
        update_type,
        sort_order,
        is_active,
        delete_flag
      FROM project_updates
      WHERE id = $1
      LIMIT 1
      `,
            [updateId],
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
        FROM project_updates
        WHERE project_id = $1
          AND COALESCE(delete_flag, false) = false
          AND id <> $2
        `,
                [targetProjectId, updateId],
            );

            set("project_id", targetProjectId);
            set("sort_order", Number(sortOrderRes.rows[0]?.next_sort_order ?? 0));
        }

        if (input.title !== undefined) set("title", input.title.trim());
        if (input.description !== undefined) set("description", input.description?.trim() || null);
        if (input.dateLabel !== undefined) set("update_date", this.normalizeDate(input.dateLabel));
        if (input.authorName !== undefined) set("author_name", input.authorName?.trim() || null);
        if (input.type !== undefined) set("update_type", input.type === "stage" ? "stage" : "progress");
        if (input.isActive !== undefined) set("is_active", Boolean(input.isActive));

        set("updated_by", currentUserId);
        updateFields.push("updated_at = now()");
        values.push(updateId);

        const updateRes = await this.db.query<ProjectUpdateRecord>(
            `
      UPDATE project_updates
      SET ${updateFields.join(", ")}
      WHERE id = $${i}
      RETURNING
        id,
        project_id,
        title,
        description,
        update_date,
        author_name,
        update_type,
        sort_order,
        is_active,
        created_at
      `,
            values,
        );

        const row = updateRes.rows[0];
        return row ? this.mapProjectUpdate(row) : null;
    }

    async remove(updateId: string, currentUserId: string): Promise<boolean> {
        const existingRes = await this.db.query<{
            id: string;
            project_id: string;
            delete_flag: boolean;
        }>(
            `
      SELECT id, project_id, delete_flag
      FROM project_updates
      WHERE id = $1
      LIMIT 1
      `,
            [updateId],
        );

        const existing = existingRes.rows[0];
        if (!existing || existing.delete_flag) {
            return false;
        }

        await this.assertCanEditProject(existing.project_id, currentUserId);

        const result = await this.db.query(
            `
      UPDATE project_updates
      SET
        delete_flag = true,
        deleted_at = now(),
        updated_at = now(),
        updated_by = $2
      WHERE id = $1
        AND COALESCE(delete_flag, false) = false
      `,
            [updateId, currentUserId],
        );

        return (result.rowCount ?? 0) > 0;
    }
}