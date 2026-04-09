import type { Pool, PoolClient } from "pg";
import type {
    CreateCompanyMediaInput,
    UpdateCompanyMediaInput,
} from "./schema.js";
import { deleteObjectByKey, getObjectBufferByKey, putObjectBuffer } from "../lib/s3Media.js";
import sharp from "sharp";
import { randomUUID } from "crypto";

type DbLike = Pool | PoolClient;

const MAX_COMPANY_MEDIA_ITEMS = 10;

type CompanyMediaRow = {
    id: string;
    company_id: string;
    kind: string | null;
    asset_url: string;
    content_type: string | null;
    sha256: string | null;
    metadata: Record<string, unknown> | null;
    s3_key: string | null;
    is_cover: boolean;
    created_at: string;
    source_media_id: string | null;
    variant: string | null;
    is_system_generated: boolean;
};

function isImageContentType(contentType: string | null | undefined) {
    return typeof contentType === "string" && contentType.startsWith("image/");
}

function getStringRecordValue(
    record: Record<string, unknown> | null | undefined,
    key: string
): string | null {
    const value = record?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractFilenameFromPathLike(value: string | null | undefined): string | null {
    if (!value) return null;

    try {
        const normalized = value.includes("://") ? new URL(value).pathname : value;
        const parts = normalized.split("/").filter(Boolean);
        const last = parts[parts.length - 1];
        if (!last) return null;
        return decodeURIComponent(last).trim() || null;
    } catch {
        const parts = value.split("/").filter(Boolean);
        const last = parts[parts.length - 1];
        return last?.trim() || null;
    }
}

function deriveDefaultCaption(input: {
    caption?: string | null;
    metadata?: Record<string, unknown> | null;
    s3Key?: string | null;
    assetUrl?: string | null;
}): string | null {
    const explicitCaption = input.caption?.trim();
    if (explicitCaption) return explicitCaption;

    return (
        getStringRecordValue(input.metadata, "caption") ||
        getStringRecordValue(input.metadata, "filename") ||
        getStringRecordValue(input.metadata, "originalFilename") ||
        getStringRecordValue(input.metadata, "name") ||
        extractFilenameFromPathLike(input.s3Key) ||
        extractFilenameFromPathLike(input.assetUrl) ||
        null
    );
}

export class CompanyMediaService {
    constructor(private readonly db: Pool) { }

    private buildLogoVariantKey(companyId: string, sourceMediaId: string) {
        return `companies/${companyId}/media/${sourceMediaId}/logo-${randomUUID()}.webp`;
    }

    private async deactivateExistingLogo(companyId: string, client: DbLike): Promise<void> {
        const existingLogoRes = await client.query<{ id: string }>(
            `
            SELECT id
            FROM company_media
            WHERE company_id = $1
              AND kind = 'logo'
              AND COALESCE(is_system_generated, false) = false
            `,
            [companyId]
        );

        const existingLogoIds = existingLogoRes.rows.map((row) => row.id);
        if (!existingLogoIds.length) return;

        await client.query(
            `
            UPDATE company_media
            SET kind = 'gallery'
            WHERE company_id = $1
              AND kind = 'logo'
              AND COALESCE(is_system_generated, false) = false
            `,
            [companyId]
        );

        await client.query(
            `
            DELETE FROM company_media
            WHERE company_id = $1
              AND source_media_id = ANY($2::uuid[])
              AND COALESCE(is_system_generated, false) = true
              AND variant = 'logo'
            `,
            [companyId, existingLogoIds]
        );
    }

    private async createLogoVariantForMedia(
        source: CompanyMediaRow,
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

        const logoKey = this.buildLogoVariantKey(source.company_id, source.id);

        const uploadedVariant = await putObjectBuffer({
            key: logoKey,
            body: logoBuffer,
            contentType: "image/webp",
        });

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
                    is_cover,
                    source_media_id,
                    variant,
                    is_system_generated
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6::jsonb, $7, false, $8, $9, true
                )
                ON CONFLICT DO NOTHING
                `,
            [
                source.company_id,
                "logo",
                uploadedVariant.assetUrl,
                "image/webp",
                uploadedVariant.sha256,
                JSON.stringify({
                    generatedFrom: source.id,
                    variant: "logo",
                    width: 160,
                    height: 160,
                }),
                uploadedVariant.key,
                source.id,
                "logo",
            ]
        );
    }

    private async assertMediaLimitNotReached(companyId: string, client: DbLike) {
        const countRes = await client.query<{ total: string }>(
            `
            SELECT COUNT(*)::text AS total
            FROM company_media
            WHERE company_id = $1
              AND COALESCE(is_system_generated, false) = false
            `,
            [companyId]
        );

        const total = Number(countRes.rows[0]?.total ?? 0);
        if (total >= MAX_COMPANY_MEDIA_ITEMS) {
            const err = new Error(
                `Company media limit reached. Maximum ${MAX_COMPANY_MEDIA_ITEMS} items allowed.`
            );
            (err as any).statusCode = 409;
            throw err;
        }
    }

    async assertCanUpload(companyId: string, userId: string) {
        const client = await this.db.connect();
        try {
            await this.assertCanEditCompany(companyId, userId, client);
            await this.assertMediaLimitNotReached(companyId, client);
        } finally {
            client.release();
        }
    }

    private async assertCanEditCompany(
        companyId: string,
        userId: string,
        client: DbLike
    ) {
        const res = await client.query<{
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

        const row = res.rows[0];
        if (!row) {
            const err = new Error("Company not found");
            (err as any).statusCode = 404;
            throw err;
        }

        if (row.owner_user_id !== userId && row.user_permission !== "creator") {
            const err = new Error("Forbidden");
            (err as any).statusCode = 403;
            throw err;
        }
    }

    private async touchCompany(companyId: string, client: DbLike) {
        await client.query(
            `UPDATE companies SET updated_at = NOW() WHERE id = $1`,
            [companyId]
        );
    }

    async createCompanyMedia(
        companyId: string,
        userId: string,
        input: CreateCompanyMediaInput
    ) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);
            await this.assertMediaLimitNotReached(companyId, client);

            const normalizedKind = input.kind?.trim() === "logo" ? "logo" : "gallery";
            const caption =
                normalizedKind === "logo"
                    ? deriveDefaultCaption({
                        ...(input.caption !== undefined ? { caption: input.caption } : {}),
                        metadata: input.metadata ?? null,
                        s3Key: input.s3Key ?? null,
                        assetUrl: input.assetUrl,
                    })
                    : (input.caption?.trim() || null);
            if (normalizedKind === "logo") {
                await this.deactivateExistingLogo(companyId, client);
            }

            if (input.isCover) {
                await client.query(
                    `
                    UPDATE company_media
                    SET is_cover = false
                    WHERE company_id = $1
                      AND COALESCE(is_system_generated, false) = false
                    `,
                    [companyId]
                );
            }

            const insertRes = await client.query<CompanyMediaRow>(
                `
                INSERT INTO company_media (
                    company_id,
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
                    company_id,
                    kind,
                    asset_url,
                    content_type,
                    sha256,
                    metadata,
                    s3_key,
                    is_cover,
                    created_at,
                    source_media_id,
                    variant,
                    is_system_generated
                `,
                [
                    companyId,
                    normalizedKind,
                    input.assetUrl,
                    input.contentType ?? null,
                    input.sha256 ?? null,
                    JSON.stringify({
                        ...(input.metadata ?? {}),
                        caption,
                    }),
                    input.s3Key ?? null,
                    Boolean(input.isCover),
                ]
            );

            const inserted = insertRes.rows[0];
            if (!inserted) {
                throw new Error("Failed to create company media");
            }

            if (normalizedKind === "logo") {
                await this.createLogoVariantForMedia(inserted, client);
            }

            await this.touchCompany(companyId, client);

            await client.query("COMMIT");
            return inserted;
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
        input: UpdateCompanyMediaInput
    ) {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            const existingRes = await client.query<{
                id: string;
                metadata: Record<string, unknown> | null;
            }>(
                `
                SELECT id, metadata
                FROM company_media
                WHERE id = $1
                  AND company_id = $2
                  AND COALESCE(is_system_generated, false) = false
                LIMIT 1
                `,
                [mediaId, companyId]
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
                    UPDATE company_media
                    SET is_cover = false
                    WHERE company_id = $1
                      AND COALESCE(is_system_generated, false) = false
                    `,
                    [companyId]
                );
            }

            const nextMetadata = {
                ...(existing.metadata ?? {}),
                ...(input.caption !== undefined
                    ? { caption: input.caption?.trim() || null }
                    : {}),
            };

            const updateRes = await client.query<CompanyMediaRow>(
                `
                UPDATE company_media
                SET
                    metadata = $3::jsonb,
                    is_cover = COALESCE($4, is_cover)
                WHERE id = $1
                  AND company_id = $2
                  AND COALESCE(is_system_generated, false) = false
                RETURNING
                    id,
                    company_id,
                    kind,
                    asset_url,
                    content_type,
                    sha256,
                    metadata,
                    s3_key,
                    is_cover,
                    created_at,
                    source_media_id,
                    variant,
                    is_system_generated
                `,
                [
                    mediaId,
                    companyId,
                    JSON.stringify(nextMetadata),
                    input.isCover ?? null,
                ]
            );

            await this.touchCompany(companyId, client);
            await client.query("COMMIT");

            return updateRes.rows[0];
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
    ): Promise<{ id: string; s3Keys: string[] }> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");
            await this.assertCanEditCompany(companyId, userId, client);

            const variantRes = await client.query<{ s3_key: string | null }>(
                `
                SELECT s3_key
                FROM company_media
                WHERE source_media_id = $1
                  AND company_id = $2
                  AND COALESCE(is_system_generated, false) = true
                  AND variant = 'logo'
                `,
                [mediaId, companyId]
            );

            await client.query(
                `
                DELETE FROM company_media
                WHERE source_media_id = $1
                  AND company_id = $2
                  AND COALESCE(is_system_generated, false) = true
                  AND variant = 'logo'
                `,
                [mediaId, companyId]
            );

            const deleteRes = await client.query<{ id: string; s3_key: string | null }>(
                `
                DELETE FROM company_media
                WHERE id = $1
                  AND company_id = $2
                  AND COALESCE(is_system_generated, false) = false
                RETURNING id, s3_key
                `,
                [mediaId, companyId]
            );

            const deleted = deleteRes.rows[0];
            if (!deleted) {
                const err = new Error("Media not found");
                (err as any).statusCode = 404;
                throw err;
            }

            await this.touchCompany(companyId, client);
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

    async cleanupDeletedCompanyMediaObjects(s3Keys: string[]): Promise<void> {
        if (!s3Keys.length) return;

        await Promise.allSettled(
            s3Keys.map((key) => deleteObjectByKey(key))
        );
    }

    async listCompanyMedia(companyId: string) {
        const result = await this.db.query<{
            id: string;
            kind: string | null;
            asset_url: string;
            content_type: string | null;
            metadata: Record<string, unknown> | null;
            is_cover: boolean;
            created_at: string;
            logo_variant_url: string | null;
        }>(
            `
        SELECT
            m.id,
            m.kind,
            m.asset_url,
            m.content_type,
            m.metadata,
            COALESCE(m.is_cover, false) AS is_cover,
            m.created_at,
            lv.asset_url AS logo_variant_url
        FROM company_media m
        LEFT JOIN company_media lv
          ON lv.source_media_id = m.id
         AND lv.company_id = m.company_id
         AND COALESCE(lv.is_system_generated, false) = true
         AND lv.variant = 'logo'
        WHERE m.company_id = $1
          AND COALESCE(m.is_system_generated, false) = false
        ORDER BY COALESCE(m.is_cover, false) DESC, m.created_at DESC
        `,
            [companyId]
        );

        return result.rows.map((row) => ({
            id: row.id,
            kind: row.kind ?? "gallery",
            assetUrl: row.asset_url,
            logoVariantUrl: row.logo_variant_url,
            contentType: row.content_type,
            caption:
                row.metadata && typeof row.metadata.caption === "string"
                    ? row.metadata.caption
                    : null,
            isCover: row.is_cover,
            createdAt: row.created_at,
        }));
    }
}