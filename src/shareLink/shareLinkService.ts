import type { Pool } from "pg";
import crypto from "crypto";
import type {
    CreateShareLinkInput,
    ShareEntityType,
    ShareLinkEventType,
    ShareLinkPreviewResponse,
    ShareLinkResponse,
} from "./schema.js";

type ShareLinkRow = {
    id: string;
    entity_type: ShareEntityType;
    entity_id: string;
    token: string;
    created_by_user_id: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    metadata: Record<string, unknown>;
};

type ResolvedEntity = {
    entityType: ShareEntityType;
    entityId: string;
    entitySlug: string | null;
    title: string | null;
    redirectTo: string;
};

export class ShareLinkService {
    constructor(private readonly db: Pool) { }

    private generateToken(): string {
        return crypto.randomBytes(32).toString("base64url");
    }

    private buildExternalShareUrl(token: string): string {
        const baseUrl = process.env.FRONTEND_BASE_URL?.trim() || "http://localhost:5173";
        return `${baseUrl.replace(/\/+$/, "")}/signup?share=${encodeURIComponent(token)}`;
    }

    private async assertCanShareEntity(
        client: Pool | { query: Pool["query"] },
        entityType: ShareEntityType,
        entityId: string,
        userId: string
    ): Promise<void> {
        if (entityType === "company") {
            const result = await client.query<{
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
                [entityId, userId]
            );

            const row = result.rows[0];
            if (!row) throw new Error("Company not found");

            const allowed =
                row.owner_user_id === userId || row.user_permission === "creator";

            if (!allowed) throw new Error("Forbidden");
            return;
        }

        if (entityType === "project") {
            const result = await client.query<{
                id: string;
                owner_user_id: string | null;
                user_permission: string | null;
            }>(
                `
                SELECT
                    p.id,
                    p.owner_user_id,
                    (
                        SELECT pu.permission
                        FROM project_users pu
                        WHERE pu.project_id = p.id
                          AND pu.user_id = $2
                          AND COALESCE(pu.delete_flag, false) = false
                        ORDER BY CASE pu.permission WHEN 'creator' THEN 1 ELSE 2 END
                        LIMIT 1
                    ) AS user_permission
                FROM projects p
                WHERE p.id = $1
                  AND COALESCE(p.delete_flag, false) = false
                LIMIT 1
                `,
                [entityId, userId]
            );

            const row = result.rows[0];
            if (!row) throw new Error("Project not found");

            const allowed =
                row.owner_user_id === userId || row.user_permission === "creator";

            if (!allowed) throw new Error("Forbidden");
            return;
        }

        throw new Error("Unsupported entity type");
    }

    private async resolveEntity(
        client: Pool | { query: Pool["query"] },
        entityType: ShareEntityType,
        entityId: string
    ): Promise<ResolvedEntity> {
        if (entityType === "company") {
            const result = await client.query<{
                id: string;
                display_name: string | null;
            }>(
                `
                SELECT c.id, c.display_name
                FROM companies c
                WHERE c.id = $1
                  AND COALESCE(c.delete_flag, false) = false
                LIMIT 1
                `,
                [entityId]
            );

            const row = result.rows[0];
            if (!row) throw new Error("Company not found");

            return {
                entityType,
                entityId,
                entitySlug: row.id,
                title: row.display_name ?? null,
                redirectTo: `/companies/${row.id}`,
            };
        }

        const result = await client.query<{
            id: string;
            name: string | null;
            upid: string | null;
        }>(
            `
            SELECT p.id, p.name, p.upid
            FROM projects p
            WHERE p.id = $1
              AND COALESCE(p.delete_flag, false) = false
            LIMIT 1
            `,
            [entityId]
        );

        const row = result.rows[0];
        if (!row) throw new Error("Project not found");

        return {
            entityType,
            entityId,
            entitySlug: row.id,
            title: row.name ?? row.upid ?? null,
            redirectTo: `/projects/${row.id}`,
        };
    }

    private async insertEvent(
        client: Pool | { query: Pool["query"] },
        input: {
            shareLinkId: string;
            entityType: ShareEntityType;
            entityId: string;
            eventType: ShareLinkEventType;
            userId?: string | null;
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
            INSERT INTO share_link_events (
                share_link_id,
                entity_type,
                entity_id,
                event_type,
                user_id,
                email,
                session_key,
                ip_address,
                user_agent,
                referrer,
                metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9, $10, $11::jsonb)
            `,
            [
                input.shareLinkId,
                input.entityType,
                input.entityId,
                input.eventType,
                input.userId ?? null,
                input.email ?? null,
                input.sessionKey ?? null,
                input.ipAddress ?? null,
                input.userAgent ?? null,
                input.referrer ?? null,
                JSON.stringify(input.metadata ?? {}),
            ]
        );
    }

    async getOrCreateShareLink(
        userId: string,
        input: CreateShareLinkInput
    ): Promise<ShareLinkResponse> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            await this.assertCanShareEntity(client, input.entityType, input.entityId, userId);
            const entity = await this.resolveEntity(client, input.entityType, input.entityId);

            const existing = await client.query<ShareLinkRow>(
                `
                SELECT *
                FROM share_links
                WHERE entity_type = $1
                  AND entity_id = $2
                  AND is_active = true
                ORDER BY created_at DESC
                LIMIT 1
                FOR UPDATE
                `,
                [input.entityType, input.entityId]
            );

            let row = existing.rows[0];

            if (!row) {
                const token = this.generateToken();

                const created = await client.query<ShareLinkRow>(
                    `
                    INSERT INTO share_links (
                        entity_type,
                        entity_id,
                        token,
                        created_by_user_id,
                        is_active,
                        metadata
                    )
                    VALUES ($1, $2, $3, $4, true, $5::jsonb)
                    RETURNING *
                    `,
                    [
                        input.entityType,
                        input.entityId,
                        token,
                        userId,
                        JSON.stringify({
                            title: entity.title,
                            entitySlug: entity.entitySlug,
                            redirectTo: entity.redirectTo,
                        }),
                    ]
                );

                row = created.rows[0];
                if (!row) throw new Error("Failed to create share link");

                await this.insertEvent(client, {
                    shareLinkId: row.id,
                    entityType: input.entityType,
                    entityId: input.entityId,
                    eventType: "link_created",
                    userId,
                    metadata: {
                        title: entity.title,
                        redirectTo: entity.redirectTo,
                    },
                });
            }

            await client.query("COMMIT");

            return {
                shareLinkId: row.id,
                entityType: row.entity_type,
                entityId: row.entity_id,
                token: row.token,
                isActive: row.is_active,
                redirectTo:
                    typeof row.metadata?.redirectTo === "string"
                        ? row.metadata.redirectTo
                        : entity.redirectTo,
                externalShareUrl: this.buildExternalShareUrl(row.token),
                title:
                    typeof row.metadata?.title === "string"
                        ? row.metadata.title
                        : entity.title,
                entitySlug:
                    typeof row.metadata?.entitySlug === "string"
                        ? row.metadata.entitySlug
                        : entity.entitySlug,
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

    async previewShareLink(token: string): Promise<ShareLinkPreviewResponse> {
        const result = await this.db.query<ShareLinkRow>(
            `
            SELECT *
            FROM share_links
            WHERE token = $1
              AND is_active = true
            LIMIT 1
            `,
            [token]
        );

        const row = result.rows[0];
        if (!row) {
            throw new Error("This shared link is invalid.");
        }

        const entity = await this.resolveEntity(this.db, row.entity_type, row.entity_id);

        return {
            ok: true,
            share: {
                token: row.token,
                redirectTo:
                    typeof row.metadata?.redirectTo === "string"
                        ? row.metadata.redirectTo
                        : entity.redirectTo,
                entityType: row.entity_type,
                entityId: row.entity_id,
                entitySlug:
                    typeof row.metadata?.entitySlug === "string"
                        ? row.metadata.entitySlug
                        : entity.entitySlug,
                title:
                    typeof row.metadata?.title === "string"
                        ? row.metadata.title
                        : entity.title,
            },
        };
    }

    async recordOpen(
        token: string,
        input?: {
            userId?: string | null;
            email?: string | null;
            sessionKey?: string | null;
            ipAddress?: string | null;
            userAgent?: string | null;
            referrer?: string | null;
            eventType?: ShareLinkEventType;
            metadata?: Record<string, unknown>;
        }
    ): Promise<void> {
        const result = await this.db.query<ShareLinkRow>(
            `
            SELECT *
            FROM share_links
            WHERE token = $1
              AND is_active = true
            LIMIT 1
            `,
            [token]
        );

        const row = result.rows[0];
        if (!row) return;

        await this.insertEvent(this.db, {
            shareLinkId: row.id,
            entityType: row.entity_type,
            entityId: row.entity_id,
            eventType: input?.eventType ?? "link_opened",
            userId: input?.userId ?? null,
            email: input?.email ?? null,
            sessionKey: input?.sessionKey ?? null,
            ipAddress: input?.ipAddress ?? null,
            userAgent: input?.userAgent ?? null,
            referrer: input?.referrer ?? null,
            metadata: input?.metadata ?? {},
        });
    }

    async deactivateShareLink(
        entityType: ShareEntityType,
        entityId: string,
        userId: string
    ): Promise<boolean> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            await this.assertCanShareEntity(client, entityType, entityId, userId);

            const result = await client.query(
                `
                UPDATE share_links
                SET is_active = false,
                    updated_at = NOW()
                WHERE entity_type = $1
                  AND entity_id = $2
                  AND is_active = true
                `,
                [entityType, entityId]
            );

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