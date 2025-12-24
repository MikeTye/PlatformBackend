import { Router } from "express";
import { query } from "../db/connection.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { deleteObjectByKey, extractKeyFromAssetUrl, getSignedReadUrlForKey, toPublicAssetUrl,
    getUploadUrlForCompanyDocument, getUploadUrlForCompanyMedia } from "../lib/s3Media.js";

const router = Router();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

type CompanyRow = {
    id: string;
    legal_name: string;
    function_description: string | null;
    geographical_coverage: string[] | null;
    company_email: string | null;
    website_url: string | null;
    phone_number: string | null;
    registration_url: string | null;
    employees_count: number | null;
    created_at: string;
    updated_at: string;
    delete_flag: boolean;
    business_function: string;
    owner_user_id: string;
};

type CompanyWithTotals = CompanyRow & {
    to_date_issued: string;
    to_date_offtake: string;
    to_date_retired: string;
};

// ───────────────────────── List companies ─────────────────────────
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? "20"), 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const q = (req.query.q as string | undefined)?.trim();

    const where: string[] = ["c.delete_flag = false"];
    const params: any[] = [];
    let i = 1;

    if (q) {
      where.push(`(c.legal_name ILIKE $${i} OR c.company_email ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const listSql = `
      SELECT
        c.*,
        cmc.cover_media_id,
        cmc.cover_asset_url,
        cmc.cover_content_type,
        cmc.cover_s3_key

      FROM companies c

      LEFT JOIN LATERAL (
        SELECT
          cm.id AS cover_media_id,
          cm.asset_url AS cover_asset_url,
          cm.content_type AS cover_content_type,
          cm.s3_key AS cover_s3_key
        FROM company_media cm
        WHERE cm.company_id = c.id
          AND (cm.asset_url IS NOT NULL AND cm.asset_url <> '' OR cm.s3_key IS NOT NULL AND cm.s3_key <> '')
        ORDER BY cm.is_cover DESC, cm.created_at DESC
        LIMIT 1
      ) cmc ON true

      ${whereSQL}
      ORDER BY c.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;

    const listParams = [...params, pageSize, offset];

    const countSql = `
      SELECT COUNT(*)::bigint AS count
      FROM companies c
      ${whereSQL}
    `;

    const [rowsRes, countRes] = await Promise.all([
      query(listSql, listParams),
      query(countSql, params),
    ]);

    const items = rowsRes.rows.map((r: any) => ({
      ...r,
      cover_asset_url: toPublicAssetUrl({ asset_url: r.cover_asset_url, s3_key: r.cover_s3_key }),
    }));

    const total = Number(countRes.rows[0]?.count ?? 0);

    res.json({ items, total, page, pageSize });
  } catch (err) {
    console.error("GET /companies error", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/mycompanies", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(String(req.query.pageSize ?? "20"), 10) || 20, 1),
      100
    );
    const offset = (page - 1) * pageSize;

    const q = (req.query.q as string | undefined)?.trim();

    const where: string[] = ["c.delete_flag = false", `c.owner_user_id = $1`];
    const params: any[] = [req.user.id];
    let i = 2; // $1 is owner_user_id

    if (q) {
      where.push(`(c.legal_name ILIKE $${i} OR c.company_email ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }

    const whereSQL = `WHERE ${where.join(" AND ")}`;

    const listSql = `
      SELECT
        c.*,
        cmc.cover_media_id,
        cmc.cover_asset_url,
        cmc.cover_content_type,
        cmc.cover_s3_key
      FROM companies c
      LEFT JOIN LATERAL (
        SELECT
          cm.id AS cover_media_id,
          cm.asset_url AS cover_asset_url,
          cm.content_type AS cover_content_type,
          cm.s3_key AS cover_s3_key
        FROM company_media cm
        WHERE cm.company_id = c.id
          AND (
            (cm.asset_url IS NOT NULL AND cm.asset_url <> '')
            OR
            (cm.s3_key IS NOT NULL AND cm.s3_key <> '')
          )
        ORDER BY cm.is_cover DESC, cm.created_at DESC
        LIMIT 1
      ) cmc ON true
      ${whereSQL}
      ORDER BY c.legal_name ASC
      LIMIT $${i} OFFSET $${i + 1}
    `;

    const listParams = [...params, pageSize, offset];

    const countSql = `
      SELECT COUNT(*)::bigint AS count
      FROM companies c
      ${whereSQL}
    `;

    const [rowsRes, countRes] = await Promise.all([
      query(listSql, listParams),
      query(countSql, params),
    ]);

    const items = rowsRes.rows.map((r: any) => ({
      ...r,
      cover_asset_url: toPublicAssetUrl({
        asset_url: r.cover_asset_url,
        s3_key: r.cover_s3_key,
      }),
    }));

    const total = Number(countRes.rows[0]?.count ?? 0);

    return res.json({ items, total, page, pageSize });
  } catch (err) {
    console.error("GET /companies/mycompanies error", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ───────────────────────── Create company ─────────────────────────
// POST /companies
// body: { legal_name, function_description?, geographical_coverage?, company_email?, ... }
router.post("/", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const {
            legal_name,
            function_description,
            geographical_coverage,
            company_email,
            website_url,
            phone_number,
            registration_url,
            employees_count,
            business_function,
        } = req.body || {};

        if (!legal_name || typeof legal_name !== "string" || !legal_name.trim()) {
            return res.status(400).json({ error: "legal_name_required" });
        }

        if (
            !company_email ||
            typeof company_email !== "string" ||
            !company_email.trim()
        ) {
            return res.status(400).json({ error: "company_email_required" });
        }

        if (
            !business_function ||
            typeof business_function !== "string" ||
            !business_function.trim()
        ) {
            return res.status(400).json({ error: "business_function_required" });
        }

        if (
            !Array.isArray(geographical_coverage) ||
            geographical_coverage.length === 0
        ) {
            return res
                .status(400)
                .json({ error: "geographical_coverage_required" });
        }

        const owner_user_id = req.user.id;

        const result = await query<CompanyRow>(
            `
        INSERT INTO companies (
          legal_name,
          function_description,
          geographical_coverage,
          company_email,
          website_url,
          phone_number,
          registration_url,
          employees_count,
          business_function,
          owner_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING *
        `,
            [
                legal_name.trim(),
                function_description ?? null,
                geographical_coverage,
                company_email.trim(),
                website_url ?? null,
                phone_number ?? null,
                registration_url ?? null,
                employees_count ?? null,
                business_function.trim(),
                owner_user_id,
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("POST /companies error", err);
        res.status(500).json({ error: "internal_error" });
    }
}
);

// ───────────────────────── Get single company (with totals) ─────────────────────────
// GET /companies/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const sql = `
      SELECT
        c.*,
        COALESCE(t.to_date_issued, 0)::text  AS to_date_issued,
        COALESCE(t.to_date_offtake, 0)::text AS to_date_offtake,
        COALESCE(t.to_date_retired, 0)::text AS to_date_retired
      FROM companies c
      LEFT JOIN v_company_credit_totals t ON t.company_id = c.id
      WHERE c.id = $1 AND c.delete_flag = false
    `;

        const { rows } = await query<CompanyWithTotals>(sql, [id]);
        const company = rows[0];

        if (!company) {
            return res.status(404).json({ error: "not_found" });
        }

        res.json(company);
    } catch (err) {
        console.error("GET /companies/:id error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// ───────────────────────── Update company ─────────────────────────
// PATCH /companies/:id
router.patch("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const {
            legal_name,
            function_description,
            geographical_coverage,
            company_email,
            website_url,
            phone_number,
            registration_url,
            employees_count,
            delete_flag,
            business_function,
        } = req.body || {};

        const fields: string[] = [];
        const params: any[] = [];
        let i = 1;

        if (legal_name !== undefined) {
            fields.push(`legal_name = $${i++}`);
            params.push(legal_name);
        }
        if (function_description !== undefined) {
            fields.push(`function_description = $${i++}`);
            params.push(function_description);
        }
        if (geographical_coverage !== undefined) {
            fields.push(`geographical_coverage = $${i++}`);
            params.push(Array.isArray(geographical_coverage) ? geographical_coverage : null);
        }
        if (company_email !== undefined) {
            fields.push(`company_email = $${i++}`);
            params.push(company_email);
        }
        if (website_url !== undefined) {
            fields.push(`website_url = $${i++}`);
            params.push(website_url);
        }
        if (phone_number !== undefined) {
            fields.push(`phone_number = $${i++}`);
            params.push(phone_number);
        }
        if (registration_url !== undefined) {
            fields.push(`registration_url = $${i++}`);
            params.push(registration_url);
        }
        if (employees_count !== undefined) {
            fields.push(`employees_count = $${i++}`);
            params.push(employees_count);
        }
        if (delete_flag !== undefined) {
            fields.push(`delete_flag = $${i++}`);
            params.push(!!delete_flag);
        }
        if (business_function !== undefined) {
            if (typeof business_function !== "string" || !business_function.trim()) {
                return res.status(400).json({ error: "business_function_required" });
            }
            fields.push(`business_function = $${i++}`);
            params.push(business_function.trim());
        }

        if (!fields.length) {
            return res.status(400).json({ error: "no_fields_to_update" });
        }

        params.push(id);

        const sql = `
      UPDATE companies
      SET ${fields.join(", ")}
      WHERE id = $${i}
      RETURNING *
    `;

        const { rows } = await query<CompanyRow>(sql, params);
        const company = rows[0];

        if (!company) {
            return res.status(404).json({ error: "not_found" });
        }

        res.json(company);
    } catch (err) {
        console.error("PATCH /companies/:id error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// ───────────────────────── Soft delete company ─────────────────────────
// DELETE /companies/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const { rows } = await query<CompanyRow>(
            `
      UPDATE companies
      SET delete_flag = true
      WHERE id = $1 AND delete_flag = false
      RETURNING *
      `,
            [id]
        );

        if (!rows[0]) {
            return res.status(404).json({ error: "not_found" });
        }

        res.status(204).send();
    } catch (err) {
        console.error("DELETE /companies/:id error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// ───────────────────────── Link users to companies ─────────────────────────
// Simple helpers to satisfy the "consultant / personal role" use-case

// POST /companies/:id/users  { user_id, role_title? }
router.post("/:id/users", async (req, res) => {
    try {
        const { id: company_id } = req.params;
        const { user_id, role_title } = req.body || {};

        if (!user_id) {
            return res.status(400).json({ error: "user_id_required" });
        }

        const { rows } = await query(
            `
      INSERT INTO company_users (company_id, user_id, role_title)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_id, user_id)
      DO UPDATE SET role_title = EXCLUDED.role_title
      RETURNING *
      `,
            [company_id, user_id, role_title ?? null]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error("POST /companies/:id/users error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// GET /companies/:id/users
router.get("/:id/users", async (req, res) => {
    try {
        const { id: company_id } = req.params;

        // adjust SELECT if you want to join users for more info
        const { rows } = await query(
            `
      SELECT cu.*
      FROM company_users cu
      WHERE cu.company_id = $1
      `,
            [company_id]
        );

        res.json({ items: rows });
    } catch (err) {
        console.error("GET /companies/:id/users error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// DELETE /companies/:id/users/:userId
router.delete("/:id/users/:userId", async (req, res) => {
    try {
        const { id: company_id, userId } = req.params;

        await query(
            `
      DELETE FROM company_users
      WHERE company_id = $1 AND user_id = $2
      `,
            [company_id, userId]
        );

        res.status(204).send();
    } catch (err) {
        console.error("DELETE /companies/:id/users/:userId error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// --- Access helper (company_users is your source of truth here) ---
async function requireCompanyAccess(companyId: string, userId: string) {
    const { rows } = await query(
        `SELECT 1 FROM company_users WHERE company_id = $1 AND user_id = $2`,
        [companyId, userId]
    );
    if (!rows.length) {
        const err: any = new Error("forbidden");
        err.status = 403;
        throw err;
    }
}

// --- Company media (images/videos) ---------------------------------

// GET /companies/:id/media
router.get("/:id/media", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        const { id } = req.params;

        const sql = `
      SELECT
        id,
        company_id,
        kind,
        asset_url,
        content_type,
        sha256,
        metadata,
        s3_key,
        created_at,
        is_cover
      FROM company_media
      WHERE company_id = $1
      ORDER BY is_cover DESC, created_at DESC
    `;
        const { rows } = await query(sql, [id]);

        const items = rows.map((row: any) => {
            const key = row.s3_key || extractKeyFromAssetUrl(row.asset_url) || null;

            return {
                ...row,
                // frontend should only use asset_url now
                asset_url: row.asset_url ?? (key ? `${PUBLIC_BASE_URL}/${key}` : null),
            };
        });

        res.json({ items });
    } catch (err) {
        console.error("GET /companies/:id/media error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// POST /companies/:id/media
router.post("/:id/media", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        const { id: companyId } = req.params;
        const { kind, content_type, sha256, metadata, s3_key, is_cover } = req.body ?? {};

        if (!s3_key) {
            return res.status(400).json({ error: "s3_key_required" });
        }

        // prevent cross-company linking
        const allowedPrefix = `companies/${companyId}/media/`;
        if (!String(s3_key).startsWith(allowedPrefix)) {
            return res.status(400).json({ error: "s3_key_invalid_prefix" });
        }

        const asset_url = `${PUBLIC_BASE_URL}/${s3_key}`;

        const sql = `
      INSERT INTO company_media (
        company_id, kind, asset_url, content_type, sha256, metadata, s3_key, is_cover
      )
      VALUES ($1,$2,$3,$4,$5,COALESCE($6,'{}'::jsonb),$7,COALESCE($8,false))
      RETURNING *
    `;

        const { rows } = await query(sql, [
            companyId,
            kind ?? null,
            asset_url,
            content_type ?? null,
            sha256 ?? null,
            metadata ?? null,
            s3_key,
            is_cover ?? false,
        ]);

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error("POST /companies/:id/media error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

router.post(
    "/:id/media/upload-url",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { id } = req.params;
            const { fileExt, contentType } = req.body ?? {};

            if (!fileExt || !contentType) {
                return res
                    .status(400)
                    .json({ error: "fileExt_and_contentType_required" });
            }

            if (!id) {
                return res.status(400).json({ error: "company_id_required" });
            }

            const { uploadUrl, key, assetUrl } =
                await getUploadUrlForCompanyMedia(id, fileExt, contentType);

            res.json({ uploadUrl, key, asset_url: assetUrl });
        } catch (err) {
            console.error("POST /companies/:id/media/upload-url error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.patch(
    "/:companyId/media/:mediaId/cover",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        const { companyId, mediaId } = req.params;

        try {
            // Clear existing cover for this company
            await query(
                `
                UPDATE company_media
                SET is_cover = false
                WHERE company_id = $1 AND is_cover = true
                `,
                [companyId]
            );

            // Set the new cover
            const { rows } = await query(
                `
                UPDATE company_media
                SET is_cover = true
                WHERE id = $1 AND company_id = $2
                RETURNING *
                `,
                [mediaId, companyId]
            );

            if (!rows.length) {
                return res.status(404).json({ error: "media_not_found" });
            }

            res.json(rows[0]);
        } catch (err: any) {
            // handle unique index race condition just in case
            if (err.code === "23505") {
                return res.status(409).json({ error: "cover_conflict" });
            }
            console.error(
                "PATCH /companies/:companyId/media/:mediaId/cover error",
                err
            );
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.delete(
    "/:companyId/media/:mediaId",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { companyId, mediaId } = req.params;

            const sql = `
        DELETE FROM company_media
        WHERE company_id = $1 AND id = $2
        RETURNING asset_url
      `;

            const { rows } = await query(sql, [companyId, mediaId]);

            if (!rows.length || !rows[0]) {
                return res.status(404).json({ error: "media_not_found" });
            }

            const assetUrl: string = rows[0].asset_url;
            const key = extractKeyFromAssetUrl(assetUrl);

            if (key) {
                try {
                    await deleteObjectByKey(key);
                } catch (e) {
                    // At this point the DB row is already gone;
                    // log the S3 failure but still return 204.
                    console.error(
                        "Failed to delete S3 object for company media",
                        key,
                        e
                    );
                }
            }

            res.status(204).send();
        } catch (err) {
            console.error(
                "DELETE /companies/:companyId/media/:mediaId error",
                err
            );
            res.status(500).json({ error: "internal_error" });
        }
    }
);

// --- Company documents (PDD, audit, credentials, etc.) -------------

// GET /companies/:id/documents
router.get(
    "/:id/documents",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { id } = req.params;
            const { docType } = req.query;

            const where: string[] = ["company_id = $1"];
            const params: any[] = [id];
            let i = 2;

            if (docType) {
                where.push(`doc_type = $${i}`);
                params.push(docType);
                i++;
            }

            const sql = `
        SELECT
          id,
          company_id,
          doc_type,
          title,
          asset_url,
          content_type,
          sha256,
          metadata,
          created_at,
          s3_key
        FROM company_documents
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
      `;

            const { rows } = await query(sql, params);

            const items = await Promise.all(
                rows.map(async (row) => {
                    const key = row.s3_key || extractKeyFromAssetUrl(row.asset_url) || null;

                    let signedUrl: string | null = null;
                    if (key) {
                        try {
                            signedUrl = await getSignedReadUrlForKey(key);
                        } catch (e) {
                            console.error("Failed to sign S3 URL for key", key, e);
                        }
                    }

                    return {
                        ...row,
                        signed_url: signedUrl,
                    };
                })
            );

            res.json({ items });
        } catch (err) {
            console.error("GET /companies/:id/documents error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.post(
    "/:id/documents/upload-url",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { id } = req.params;
            const { fileExt, contentType } = req.body ?? {};

            if (!fileExt || !contentType) {
                return res
                    .status(400)
                    .json({ error: "fileExt_and_contentType_required" });
            }

            if (!id) {
                return res.status(400).json({ error: "company_id_required" });
            }

            const { uploadUrl, key, assetUrl } = await getUploadUrlForCompanyDocument(
                id,
                fileExt,
                contentType
            );

            res.json({ uploadUrl, s3_key: key, asset_url: assetUrl });
        } catch (err) {
            console.error("POST /companies/:id/documents/upload-url error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.post(
    "/:id/documents",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { id } = req.params;
            const { doc_type, title, asset_url, s3_key, content_type, sha256, metadata } =
                req.body ?? {};

            if (!doc_type || !asset_url) {
                return res.status(400).json({ error: "missing_fields" });
            }

            const derivedKey = extractKeyFromAssetUrl(asset_url);
            const finalKey = s3_key ?? derivedKey;

            if (!finalKey) {
                return res.status(400).json({ error: "s3_key_required_or_unparseable_asset_url" });
            }

            // optional consistency check (recommended)
            if (s3_key && derivedKey && s3_key !== derivedKey) {
                return res.status(400).json({ error: "s3_key_mismatch_with_asset_url" });
            }

            const sql = `
                INSERT INTO company_documents (
                    company_id,
                    doc_type,
                    title,
                    asset_url,
                    s3_key,
                    content_type,
                    sha256,
                    metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, '{}'::jsonb))
                RETURNING *
                `;

            const { rows } = await query(sql, [
                id,
                doc_type,
                title ?? null,
                asset_url,
                finalKey,
                content_type ?? null,
                sha256 ?? null,
                metadata ?? null,
            ]);

            res.status(201).json(rows[0]);
        } catch (err) {
            console.error("POST /companies/:id/documents error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.delete(
    "/:companyId/documents/:documentId",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { companyId, documentId } = req.params;

            const sql = `
                DELETE FROM company_documents
                WHERE company_id = $1 AND id = $2
                RETURNING asset_url, s3_key
                `;

            const { rows } = await query(sql, [companyId, documentId]);

            if (!rows.length || !rows[0]) {
                return res.status(404).json({ error: "document_not_found" });
            }

            const assetUrl: string = rows[0].asset_url;
            const key = rows[0].s3_key || extractKeyFromAssetUrl(assetUrl);

            if (key) {
                try {
                    await deleteObjectByKey(key);
                } catch (e) {
                    // At this point the DB row is already gone;
                    // log the S3 failure but still return 204.
                    console.error(
                        "Failed to delete S3 object for company document",
                        key,
                        e
                    );
                }
            }

            res.status(204).send();
        } catch (err) {
            console.error(
                "DELETE /companies/:companyId/documents/:documentId error",
                err
            );
            res.status(500).json({ error: "internal_error" });
        }
    }
);

export default router;