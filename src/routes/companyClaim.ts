import { Router } from "express";
import { query } from "../db/connection.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { createUploadUrlForCompanyClaim, getSignedReadUrlForKey } from "../lib/s3Media.js";

const router = Router();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

// POST /companies/:id/claims
router.post("/:id/claims", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        const companyId = req.params.id;
        const userId = req.user.id;

        const { evidenceText, contactEmail, role, files } = req.body || {};

        // 1) Ensure company exists & is unclaimed
        const companySql = `
            SELECT id, owner_user_id
            FROM companies
            WHERE id = $1 AND delete_flag = false
            LIMIT 1
        `;
        const { rows: companyRows } = await query(companySql, [companyId]);
        const company = companyRows[0];
        if (!company) return res.status(404).json({ error: "company_not_found" });

        if (company.owner_user_id) {
            return res.status(400).json({ error: "already_claimed" });
        }

        // 2) Enforce "max 3 pending claims" per user
        const pendingCountSql = `
            SELECT COUNT(*)::int AS count
            FROM company_claims
            WHERE claimant_user_id = $1
              AND status = 'pending'
        `;
        const { rows: pendingRows } = await query(pendingCountSql, [userId]);
        const count = pendingRows?.[0]?.count ?? 0;

        if (count >= 3) {
            return res.status(400).json({ error: "too_many_pending_claims" });
        }

        // 3) Normalize files from body (what frontend sends after S3 upload-url usage)
        const normalizedFiles: Array<{
            key: string;
            assetUrl: string | null;
            fileName: string | null;
            contentType: string | null;
            size: number | null;
        }> = Array.isArray(files)
                ? files
                    .filter((f: any) => f && typeof f.key === "string")
                    .map((f: any) => ({
                        key: f.key,
                        assetUrl: f.assetUrl ?? null,
                        fileName: f.fileName ?? null,
                        contentType: f.contentType ?? null,
                        size: typeof f.size === "number" ? f.size : null,
                    }))
                : [];

        // If you still want metadata JSON for non-file stuff:
        const evidenceMetadata = {
            contactEmail: contactEmail || null,
            role: role || null,
            // You can decide to keep files here or not:
            // files: normalizedFiles,
        };

        await query("BEGIN");

        // 4) Insert claim row
        const insertSql = `
            INSERT INTO company_claims (
                company_id, claimant_user_id, status, evidence_text, evidence_metadata
            )
            VALUES ($1, $2, 'pending', $3, $4)
            RETURNING *
        `;
        const { rows: claimRows } = await query(insertSql, [
            companyId,
            userId,
            evidenceText || null,
            evidenceMetadata,
        ]);
        const claim = claimRows[0];

        // 5) Insert files into company_claim_files
        if (claim && normalizedFiles.length > 0) {
            const values: any[] = [];
            const placeholders: string[] = [];

            normalizedFiles.forEach((f, i) => {
                const baseIndex = i * 6;
                placeholders.push(
                    `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`
                );
                values.push(
                    claim.id,      // claim_id
                    f.key,         // s3_key
                    f.assetUrl,    // asset_url
                    f.fileName,    // file_name
                    f.contentType, // content_type
                    f.size         // size
                );
            });

            const filesSql = `
                INSERT INTO company_claim_files (
                    claim_id, s3_key, asset_url, file_name, content_type, size
                )
                VALUES ${placeholders.join(", ")}
            `;
            await query(filesSql, values);
        }

        await query("COMMIT");

        // TODO: send email / slack to internal review inbox

        res.status(201).json({ claim });
    } catch (err) {
        await query("ROLLBACK").catch(() => { });
        console.error("POST /companies/:id/claims error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

router.post("/:id/approve", authMiddleware, async (req: AuthedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const claimId = req.params.id;
    const adminUserId = req.user.id;

    try {
        await query("BEGIN");

        const { rows: claimRows } = await query(
            `SELECT * FROM company_claims WHERE id = $1 FOR UPDATE`,
            [claimId]
        );
        const claim = claimRows[0];
        if (!claim) {
            await query("ROLLBACK");
            return res.status(404).json({ error: "claim_not_found" });
        }

        if (claim.status !== "pending") {
            await query("ROLLBACK");
            return res.status(400).json({ error: "not_pending" });
        }

        // set company owner
        await query(
            `UPDATE companies SET owner_user_id = $1, updated_at = now() WHERE id = $2`,
            [claim.claimant_user_id, claim.company_id]
        );

        // mark claim as approved
        await query(
            `UPDATE company_claims
       SET status = 'approved',
           decided_at = now(),
           decided_by_user_id = $2
       WHERE id = $1`,
            [claimId, adminUserId]
        );

        await query("COMMIT");
        res.json({ success: true });
    } catch (err) {
        await query("ROLLBACK");
        console.error("approve claim error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

router.post("/:id/reject", authMiddleware, async (req: AuthedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const claimId = req.params.id;
    const adminUserId = req.user.id;
    const { rejectionReason } = req.body;

    try {
        const sql = `
      UPDATE company_claims
      SET status = 'rejected',
          rejection_reason = $2,
          decided_at = now(),
          decided_by_user_id = $3
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `;
        const { rows } = await query(sql, [claimId, rejectionReason || null, adminUserId]);
        const claim = rows[0];
        if (!claim) return res.status(404).json({ error: "claim_not_found_or_not_pending" });

        res.json({ claim });
    } catch (err) {
        console.error("reject claim error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

router.post(
    "/:id/claims/upload-url",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: "Unauthorized" });

            const companyId = req.params.id;
            const { fileName, contentType } = req.body || {};

            if (!fileName) {
                return res.status(400).json({ error: "missing_file_name" });
            }

            // Optional: ensure company exists (and not deleted)
            const sql = `
                SELECT id
                FROM companies
                WHERE id = $1 AND delete_flag = false
                LIMIT 1
            `;
            const { rows } = await query(sql, [companyId]);
            if (!rows[0]) {
                return res.status(404).json({ error: "company_not_found" });
            }

            const uploadInfo = await createUploadUrlForCompanyClaim(
                companyId!,
                fileName,
                contentType || "application/octet-stream"
            );

            res.json(uploadInfo);
        } catch (err) {
            console.error("POST /companies/:id/claims/upload-url error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.get("/:id/claims/my", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
            const companyId = req.params.id;
        const userId = req.user.id;

        const sql = `
            SELECT id, company_id, claimant_user_id, status, created_at, decided_at, rejection_reason
            FROM company_claims
            WHERE company_id = $1 AND claimant_user_id = $2
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const { rows } = await query(sql, [companyId, userId]);

        if (!rows[0]) {
            return res.status(404).json({ error: "not_found" });
        }

        const claim = rows[0];

        const filesSql = `
            SELECT
                id,
                s3_key,
                asset_url,
                file_name,
                content_type,
                size,
                created_at
            FROM company_claim_files
            WHERE claim_id = $1
            ORDER BY created_at ASC
        `;
        const { rows: fileRows } = await query(filesSql, [claim.id]);

        return res.json({
            ...claim,
            files: fileRows,
        });
    } catch (err) {
        console.error("GET /companies/:companyId/claims/my error", err);
        return res.status(500).json({ error: "internal_error" });
    }
});

router.get(
    "/:id/files/:fileIndex",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: "unauthorized" });

            const isReviewer =
                (req.user as any).is_admin ||
                (req.user as any).is_reviewer ||
                (req.user as any).role === "claims_reviewer";

            if (!isReviewer) {
                return res.status(403).json({ error: "forbidden" });
            }

            const { claimId, fileIndex } = req.params;
            const index = Number(fileIndex);
            if (!Number.isInteger(index) || index < 0) {
                return res.status(400).json({ error: "invalid_file_index" });
            }

            // Ensure claim exists (optional strictness)
            const claimSql = `
                SELECT id
                FROM company_claims
                WHERE id = $1
                LIMIT 1
            `;
            const { rows: claimRows } = await query(claimSql, [claimId]);
            if (!claimRows[0]) {
                return res.status(404).json({ error: "claim_not_found" });
            }

            // Get the N-th file for this claim (stable order by created_at, id)
            const fileSql = `
                SELECT
                    id,
                    s3_key,
                    asset_url,
                    file_name,
                    content_type,
                    size,
                    created_at
                FROM company_claim_files
                WHERE claim_id = $1
                ORDER BY created_at ASC, id ASC
                LIMIT 1 OFFSET $2
            `;
            const { rows: fileRows } = await query(fileSql, [claimId, index]);
            const file = fileRows[0];

            if (!file) {
                return res.status(404).json({ error: "file_not_found" });
            }

            const key = file.s3_key;
            if (!key) {
                return res.status(500).json({ error: "missing_s3_key" });
            }

            // You can choose between:
            // 1) Signed URL (download-limited)
            const signedUrl = await getSignedReadUrlForKey(key);

            // or 2) Public URL via PUBLIC_BASE_URL (if using CloudFront/public bucket)
            // const publicUrl = file.asset_url || (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/${key}` : null);

            return res.json({
                url: signedUrl,
                expiresInSeconds: 60 * 5,
                fileName: file.file_name ?? null,
                contentType: file.content_type ?? null,
            });
        } catch (err) {
            console.error("GET /company-claims/:claimId/files/:fileIndex error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

export default router;