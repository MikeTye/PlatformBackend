import type { Pool, PoolClient } from "pg";
import type {
    CreateProjectDocumentBody,
    UpdateProjectDocumentBody,
} from "./schema.js";

type DbLike = Pool | PoolClient;

const MAX_PROJECT_DOCUMENT_ITEMS = 10;

export class ProjectDocumentService {
    constructor(private readonly db: Pool) { }

    private async assertCanEditProject(projectId: string, userId: string, client: DbLike) {
        const res = await client.query(
            `
      SELECT
        p.id,
        p.owner_user_id,
        EXISTS (
          SELECT 1
          FROM project_users pu
          WHERE pu.project_id = p.id
            AND pu.member_type = 'user'
            AND pu.member_user_id = $2
            AND pu.permission = 'creator'
            AND COALESCE(pu.delete_flag, false) = false
        ) AS is_creator_member
      FROM projects p
      WHERE p.id = $1
        AND COALESCE(p.delete_flag, false) = false
      LIMIT 1
      `,
            [projectId, userId]
        );

        const row = res.rows[0];
        if (!row) {
            const err = new Error("Project not found");
            (err as any).statusCode = 404;
            throw err;
        }

        if (row.owner_user_id !== userId && row.is_creator_member !== true) {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }
    }

    private async touchProject(projectId: string, client: DbLike) {
        await client.query(
            `UPDATE projects SET updated_at = now() WHERE id = $1`,
            [projectId]
        );
    }

    private async assertDocumentLimitNotReached(projectId: string, client: DbLike) {
        const countRes = await client.query<{ total: string }>(
            `
            SELECT COUNT(*)::text AS total
            FROM project_documents
            WHERE project_id = $1
            `,
            [projectId]
        );

        const total = Number(countRes.rows[0]?.total ?? 0);
        if (total >= MAX_PROJECT_DOCUMENT_ITEMS) {
            const err = new Error(`Project document limit reached. Maximum ${MAX_PROJECT_DOCUMENT_ITEMS} items allowed.`);
            (err as any).statusCode = 409;
            throw err;
        }
    }

    async assertCanUpload(projectId: string, userId: string) {
        const client = await this.db.connect();
        try {
            await this.assertCanEditProject(projectId, userId, client);
            await this.assertDocumentLimitNotReached(projectId, client);
        } finally {
            client.release();
        }
    }

    async create(projectId: string, userId: string, input: CreateProjectDocumentBody) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);
            await this.assertDocumentLimitNotReached(projectId, client);

            const insertRes = await client.query(
                `
        INSERT INTO project_documents (
          project_id,
          kind,
          status,
          asset_url,
          content_type,
          sha256,
          metadata,
          s3_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        RETURNING
          id,
          project_id,
          kind,
          status,
          asset_url,
          content_type,
          sha256,
          metadata,
          s3_key,
          created_at
        `,
                [
                    projectId,
                    input.kind?.trim() || "general",
                    input.status?.trim() || null,
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

            await this.touchProject(projectId, client);
            await client.query("COMMIT");

            return insertRes.rows[0];
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        projectId: string,
        documentId: string,
        userId: string,
        input: UpdateProjectDocumentBody
    ) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const existingRes = await client.query<{
                id: string;
                metadata: Record<string, unknown> | null;
                status: string | null;
                kind: string | null;
            }>(
                `
      SELECT id, metadata, status, kind
      FROM project_documents
      WHERE id = $1
        AND project_id = $2
      LIMIT 1
      `,
                [documentId, projectId]
            );

            const existing = existingRes.rows[0];
            if (!existing) {
                const err = new Error("Document not found");
                (err as any).statusCode = 404;
                throw err;
            }

            const nextMetadata = {
                ...(existing.metadata ?? {}),
                ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
            };

            const nextStatus =
                input.status !== undefined ? input.status?.trim() || null : existing.status;

            const nextKind =
                input.kind !== undefined ? input.kind?.trim() || null : existing.kind;

            const updateRes = await client.query(
                `
      UPDATE project_documents
      SET
        kind = $3,
        status = $4,
        metadata = $5::jsonb
      WHERE id = $1
        AND project_id = $2
      RETURNING
        id,
        project_id,
        kind,
        status,
        asset_url,
        content_type,
        sha256,
        metadata,
        s3_key,
        created_at
      `,
                [
                    documentId,
                    projectId,
                    nextKind,
                    nextStatus,
                    JSON.stringify(nextMetadata),
                ]
            );

            await this.touchProject(projectId, client);
            await client.query("COMMIT");

            return updateRes.rows[0];
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async remove(projectId: string, documentId: string, userId: string) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const deleteRes = await client.query<{ id: string; s3_key: string | null }>(
                `
        DELETE FROM project_documents
        WHERE id = $1
          AND project_id = $2
        RETURNING id, s3_key
        `,
                [documentId, projectId]
            );

            const deleted = deleteRes.rows[0];
            if (!deleted) {
                const err = new Error("Document not found");
                (err as any).statusCode = 404;
                throw err;
            }

            await this.touchProject(projectId, client);
            await client.query("COMMIT");

            return deleted;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}