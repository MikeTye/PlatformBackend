import type { Pool, PoolClient } from "pg";
import type {
    CreateProjectMediaBody,
    UpdateProjectMediaBody,
} from "./schema.js";
import { getObjectBufferByKey, putObjectBuffer } from "../lib/s3Media.js";
import sharp from "sharp";
import { randomUUID } from "crypto";

type DbLike = Pool | PoolClient;

type ProjectMediaRow = {
    id: string;
    project_id: string;
    kind: string | null;
    asset_url: string;
    content_type: string | null;
    sha256: string | null;
    metadata: Record<string, unknown> | null;
    s3_key: string | null;
    is_cover: boolean;
    created_at: string;
};

function isImageContentType(contentType: string | null | undefined) {
    return typeof contentType === "string" && contentType.startsWith("image/");
}

export class ProjectMediaService {
    constructor(private readonly db: Pool) { }

    private buildLogoVariantKey(projectId: string, sourceMediaId: string) {
        return `projects/${projectId}/media/${sourceMediaId}/logo-${randomUUID()}.webp`;
    }

    private async createLogoVariantForMedia(
        source: ProjectMediaRow,
        client: DbLike
    ): Promise<void> {
        if (!source.s3_key) return;
        if (!isImageContentType(source.content_type)) return;

        const originalBuffer = await getObjectBufferByKey(source.s3_key);

        const logoBuffer = await sharp(originalBuffer)
            .resize(160, 160, {
                fit: "cover",
                position: "centre",
                withoutEnlargement: false,
            })
            .webp({ quality: 78 })
            .toBuffer();

        const logoKey = this.buildLogoVariantKey(source.project_id, source.id);

        await putObjectBuffer({
            key: logoKey,
            body: logoBuffer,
            contentType: "image/webp",
        });

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
        is_cover,
        source_media_id,
        variant,
        is_system_generated
      )
      VALUES (
        $1, $2, $3, $4, NULL, $5::jsonb, $6, false, $7, $8, true
      )
      ON CONFLICT DO NOTHING
      `,
            [
                source.project_id,
                source.kind ?? "image",
                logoKey,
                "image/webp",
                JSON.stringify({
                    generatedFrom: source.id,
                    variant: "logo",
                    width: 160,
                    height: 160,
                }),
                logoKey,
                source.id,
                "logo",
            ]
        );
    }

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

    async create(projectId: string, userId: string, input: CreateProjectMediaBody) {
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
          AND COALESCE(is_system_generated, false) = false
        `,
                    [projectId]
                );
            }

            const insertRes = await client.query<ProjectMediaRow>(
                `
      INSERT INTO project_media (
        project_id,
        kind,
        asset_url,
        content_type,
        sha256,
        metadata,
        s3_key,
        is_cover,
        source_media_id,
        variant,
        is_system_generated
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NULL, NULL, false)
      RETURNING
        id,
        project_id,
        kind,
        asset_url,
        content_type,
        sha256,
        metadata,
        s3_key,
        is_cover,
        created_at
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

            const inserted = insertRes.rows[0];
            if (!inserted) {
                throw new Error("Failed to create media");
            }

            await this.createLogoVariantForMedia(inserted, client);

            await this.touchProject(projectId, client);
            await client.query("COMMIT");

            return inserted;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(projectId: string, mediaId: string, userId: string, input: UpdateProjectMediaBody) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const existingRes = await client.query<{
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

            const existing = existingRes.rows[0];
            if (!existing) {
                const err = new Error("Media not found");
                (err as any).statusCode = 404;
                throw err;
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
                ...(existing.metadata ?? {}),
                ...(input.caption !== undefined
                    ? { caption: input.caption?.trim() || null }
                    : {}),
            };

            const updateRes = await client.query(
                `
        UPDATE project_media
        SET
          metadata = $3::jsonb,
          is_cover = COALESCE($4, is_cover)
        WHERE id = $1
          AND project_id = $2
        RETURNING
          id,
          project_id,
          kind,
          asset_url,
          content_type,
          sha256,
          metadata,
          s3_key,
          is_cover,
          created_at
        `,
                [
                    mediaId,
                    projectId,
                    JSON.stringify(nextMetadata),
                    input.isCover,
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

    async remove(projectId: string, mediaId: string, userId: string) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditProject(projectId, userId, client);

            const variantRes = await client.query<{ s3_key: string | null }>(
                `
      SELECT s3_key
      FROM project_media
      WHERE source_media_id = $1
        AND project_id = $2
      `,
                [mediaId, projectId]
            );

            const deleteRes = await client.query<{ id: string; s3_key: string | null }>(
                `
      DELETE FROM project_media
      WHERE id = $1
        AND project_id = $2
      RETURNING id, s3_key
      `,
                [mediaId, projectId]
            );

            const deleted = deleteRes.rows[0];
            if (!deleted) {
                const err = new Error("Media not found");
                (err as any).statusCode = 404;
                throw err;
            }

            await this.touchProject(projectId, client);
            await client.query("COMMIT");

            return {
                id: deleted.id,
                s3Keys: [
                    deleted.s3_key,
                    ...variantRes.rows.map((r) => r.s3_key),
                ].filter((v): v is string => Boolean(v)),
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}