import type { Pool } from "pg";
import type { CompanyDetailResult } from "../companies/companyService.js";

export class CompanyDocumentService {
    constructor(private readonly db: Pool) { }

    private async assertCanEditCompany(
        companyId: string,
        userId: string,
        client: Pool | { query: Pool["query"] } = this.db
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

        const existing = accessCheck.rows[0];
        if (!existing) {
            throw new Error("Company not found");
        }

        const canEdit =
            existing.owner_user_id === userId || existing.user_permission === "creator";

        if (!canEdit) {
            throw new Error("Forbidden");
        }
    }

    async createCompanyDocument(
        companyId: string,
        userId: string,
        input: {
            kind?: string | undefined;
            assetUrl: string;
            contentType?: string | null | undefined;
            s3Key?: string | null | undefined;
            sha256?: string | null | undefined;
            name?: string | null | undefined;
            type?: string | null | undefined;
            metadata?: Record<string, unknown> | undefined;
        }
    ): Promise<void> {
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
            name?: string | null | undefined;
            type?: string | null | undefined;
        }
    ): Promise<void> {
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
    ): Promise<{ s3Key: string | null }> {
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
            return { s3Key: row.s3_key };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async listCompanyDocuments(companyId: string): Promise<CompanyDetailResult["documents"]> {
        const result = await this.db.query<{
            id: string;
            kind: string;
            asset_url: string;
            content_type: string | null;
            metadata: Record<string, unknown> | null;
            created_at: string;
        }>(
            `
            SELECT
                id,
                kind,
                asset_url,
                content_type,
                metadata,
                created_at
            FROM company_documents
            WHERE company_id = $1
            ORDER BY created_at DESC
            `,
            [companyId]
        );

        return result.rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            assetUrl: row.asset_url,
            contentType: row.content_type,
            name:
                row.metadata && typeof row.metadata.name === "string"
                    ? row.metadata.name
                    : null,
            type:
                row.metadata && typeof row.metadata.type === "string"
                    ? row.metadata.type
                    : null,
            createdAt: row.created_at,
        }));
    }
}