import { Router } from "express";
import { query } from "../db/connection.js";
import {
    extractKeyFromAssetUrl, toPublicAssetUrl, getSignedReadUrlForKey,
    getUploadUrlForProjectMedia, deleteObjectByKey, getUploadUrlForProjectDocument,
    publicAssetUrlForKey
} from "../lib/s3Media.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

const router = Router();

// --- Helpers -------------------------------------------------------

const insertableProjectCols = [
    "company_id",
    "name",
    "project_type",
    "sector",
    "host_country",
    "host_region",
    "pdd_status",
    "audit_status",
    "inception_date",
    "credit_issuance_date",
    "registry_date",
    "registration_date_expected",
    "registration_date_actual",
    "implementation_start",
    "implementation_end",
    "crediting_start",
    "crediting_end",
    "status",
    "registry_project_url",
    "registration_platform",
    "methodology_id",
    "methodology_version",
    "methodology_notes",
    "tenure_text",
    "completion_date",
    "project_methodology_doc_url",
    "expected_annual_reductions",
    "volume_offered_authority",
    "tenderer_role",
    "description",
];

const updatableProjectCols = insertableProjectCols; // same set for now

// --- List projects -------------------------------------------------
// GET /projects?Page&pageSize&q&projectType&status&sector&hostCountry&companyId
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? "20"), 10) || 20, 1), 100);

    const q = (req.query.q as string | undefined)?.trim();
    const projectType = req.query.projectType as string | undefined;
    const status = req.query.status as string | undefined;
    const sector = req.query.sector as string | undefined;
    const hostCountry = req.query.hostCountry as string | undefined;
    const companyId = req.query.companyId as string | undefined;

    const where: string[] = ["p.delete_flag = false"];
    const params: any[] = [];
    let i = 1;

    if (q) {
      where.push(`(p.name ILIKE $${i} OR p.description ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }
    if (projectType) { where.push(`p.project_type = $${i}`); params.push(projectType); i++; }
    if (status) { where.push(`p.status = $${i}`); params.push(status); i++; }
    if (sector) { where.push(`p.sector = $${i}`); params.push(sector); i++; }
    if (hostCountry) { where.push(`p.host_country = $${i}`); params.push(hostCountry); i++; }
    if (companyId) { where.push(`p.company_id = $${i}`); params.push(companyId); i++; }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const listSql = `
      SELECT
        p.*,
        v.to_date_issued,
        v.to_date_offtake,
        v.to_date_retired,

        pmc.cover_media_id,
        pmc.cover_asset_url,
        pmc.cover_content_type,
        pmc.cover_s3_key

      FROM projects p
      LEFT JOIN v_project_credit_totals v
        ON v.project_id = p.id

      LEFT JOIN LATERAL (
        SELECT
          pm.id AS cover_media_id,
          pm.asset_url AS cover_asset_url,
          pm.content_type AS cover_content_type,
          pm.s3_key AS cover_s3_key
        FROM project_media pm
        WHERE pm.project_id = p.id
          AND (pm.asset_url IS NOT NULL AND pm.asset_url <> '' OR pm.s3_key IS NOT NULL AND pm.s3_key <> '')
        ORDER BY pm.is_cover DESC, pm.created_at DESC
        LIMIT 1
      ) pmc ON true

      ${whereSQL}
      ORDER BY p.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const listParams = [...params, pageSize, offset];

    const countSql = `
      SELECT COUNT(*)::bigint AS count
      FROM projects p
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
    console.error("GET /projects error", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/myprojects", authMiddleware, async (req: AuthedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const sql = `
    SELECT
      p.*,
      pmc.cover_media_id,
      pmc.cover_asset_url,
      pmc.cover_content_type
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT
        pm.id AS cover_media_id,
        pm.asset_url AS cover_asset_url,
        pm.content_type AS cover_content_type
      FROM project_media pm
      WHERE pm.project_id = p.id
        AND pm.asset_url IS NOT NULL
        AND pm.asset_url <> ''
      ORDER BY pm.is_cover DESC, pm.created_at DESC
      LIMIT 1
    ) pmc ON true
    WHERE p.owner_user_id = $1
      AND p.delete_flag = false
    ORDER BY p.name ASC
  `;

    const { rows } = await query(sql, [req.user.id]);
    return res.json(rows);
});

// --- Get single project --------------------------------------------
// GET /projects/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const sql = `
      SELECT
        p.*,
        v.to_date_issued,
        v.to_date_offtake,
        v.to_date_retired,
        (
          SELECT COUNT(*)::int
          FROM project_documents d
          WHERE d.project_id = p.id
        ) AS document_count
      FROM projects p
      LEFT JOIN v_project_credit_totals v
        ON v.project_id = p.id
      WHERE p.id = $1
        AND p.delete_flag = false
      LIMIT 1
    `;
        const { rows } = await query(sql, [id]);

        if (!rows[0]) return res.status(404).json({ error: "not_found" });

        res.json(rows[0]);
    } catch (err) {
        console.error("GET /projects/:id error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// --- Create project ------------------------------------------------
// POST /projects
router.post("/", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const body = req.body ?? {};

        const cols: string[] = [];
        const values: any[] = [];

        // Fill from body for normal insertable columns
        for (const col of insertableProjectCols) {
            if (body[col] !== undefined) {
                cols.push(col);
                values.push(body[col]);
            }
        }

        // Required fields
        if (!cols.includes("name")) {
            return res.status(400).json({ error: "name_required" });
        }
        if (!cols.includes("project_type")) {
            return res.status(400).json({ error: "project_type_required" });
        }

        // Always add owner_user_id based on the logged-in user
        cols.push("owner_user_id");
        values.push(req.user.id);

        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");

        const sql = `
      INSERT INTO projects (${cols.join(", ")})
      VALUES (${placeholders})
      RETURNING *
    `;

        const { rows } = await query(sql, values);
        res.status(201).json(rows[0]);
    } catch (err: any) {
        console.error("POST /projects error", err);
        if (err?.code === "23503") {
            return res.status(400).json({ error: "invalid_reference" });
        }
        if (err?.code === "22P02") {
            return res.status(400).json({ error: "invalid_input_syntax" });
        }
        res.status(500).json({ error: "internal_error" });
    }
});

// --- Update project (partial) --------------------------------------
// PATCH /projects/:id
router.patch("/:id", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { id } = req.params;
        const body = req.body ?? {};

        const sets: string[] = [];
        const values: any[] = [];
        let i = 1;

        // only allow updating allowed fields
        for (const col of updatableProjectCols) {
            if (body[col] !== undefined) {
                sets.push(`${col} = $${i}`);
                values.push(body[col]);
                i++;
            }
        }

        if (!sets.length) {
            return res.status(400).json({ error: "no_fields_to_update" });
        }

        // add id + owner_user_id to params
        values.push(id);          // $i
        values.push(req.user.id); // $i+1

        const sql = `
      UPDATE projects
      SET ${sets.join(", ")}
      WHERE id = $${i}
        AND owner_user_id = $${i + 1}
        AND delete_flag = false
      RETURNING *
    `;

        const { rows } = await query(sql, values);

        if (!rows[0]) {
            // either not found, soft-deleted, or not owned by this user
            return res.status(404).json({ error: "not_found" });
        }

        res.json(rows[0]);
    } catch (err: any) {
        console.error("PATCH /projects/:id error", err);
        if (err?.code === "22P02") {
            return res.status(400).json({ error: "invalid_input" });
        }
        res.status(500).json({ error: "internal_error" });
    }
});

// --- Soft delete project -------------------------------------------
// DELETE /projects/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const sql = `
      UPDATE projects
      SET delete_flag = true
      WHERE id = $1
        AND delete_flag = false
      RETURNING id
    `;

        const { rows } = await query(sql, [id]);

        if (!rows[0]) {
            return res.status(404).json({ error: "not_found" });
        }

        res.status(204).send();
    } catch (err) {
        console.error("DELETE /projects/:id error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// --- Credit events (simple MVP) ------------------------------------
// GET /projects/:id/credits
router.get("/:id/credits", async (req, res) => {
    try {
        const { id } = req.params;

        const [eventsRes, totalsRes] = await Promise.all([
            query(
                `
        SELECT *
        FROM credit_events
        WHERE project_id = $1
        ORDER BY event_date DESC, created_at DESC
      `,
                [id]
            ),
            query(
                `
        SELECT *
        FROM v_project_credit_totals
        WHERE project_id = $1
      `,
                [id]
            ),
        ]);

        res.json({
            totals: totalsRes.rows[0] ?? {
                project_id: id,
                to_date_issued: "0",
                to_date_offtake: "0",
                to_date_retired: "0",
            },
            events: eventsRes.rows,
        });
    } catch (err) {
        console.error("GET /projects/:id/credits error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// POST /projects/:id/credits
router.post("/:id/credits", async (req, res) => {
    try {
        const { id } = req.params;
        const { event_type, quantity, event_date, registry_tx_id, notes } =
            req.body ?? {};

        if (!event_type || quantity == null || !event_date) {
            return res.status(400).json({ error: "missing_fields" });
        }

        const sql = `
      INSERT INTO credit_events (
        project_id, event_type, quantity, event_date, registry_tx_id, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

        const { rows } = await query(sql, [
            id,
            event_type,
            quantity,
            event_date,
            registry_tx_id ?? null,
            notes ?? null,
        ]);

        res.status(201).json(rows[0]);
    } catch (err: any) {
        console.error("POST /projects/:id/credits error", err);
        if (err?.code === "22P02") {
            // enum / date etc
            return res.status(400).json({ error: "invalid_input" });
        }
        if (err?.code === "23503") {
            // FK project not found
            return res.status(404).json({ error: "project_not_found" });
        }
        res.status(500).json({ error: "internal_error" });
    }
});

// --- Project media (images/videos) ---------------------------------

// GET /projects/:id/media
router.get("/:id/media", async (req: AuthedRequest, res) => {
    try {
        const { id } = req.params;

        const sql = `
      SELECT
        id,
        project_id,
        kind,
        asset_url,
        content_type,
        sha256,
        metadata,
        s3_key,
        created_at,
        is_cover
      FROM project_media
      WHERE project_id = $1
      ORDER BY is_cover DESC, created_at DESC
    `;
        const { rows } = await query(sql, [id]);

        const items = await Promise.all(
            rows.map(async (row) => {
                // Prefer explicit s3_key; otherwise derive from stored asset_url.
                const key =
                    row.s3_key || extractKeyFromAssetUrl(row.asset_url) || null;

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
                    // keep original asset_url in case you still want to use it,
                    // and add a safe URL the frontend can rely on:
                    asset_url: row.asset_url ?? (key ? publicAssetUrlForKey(key) : null),
                };
            })
        );

        res.json({ items });
    } catch (err) {
        console.error("GET /projects/:id/media error", err);
        res.status(500).json({ error: "internal_error" });
    }
});

// POST /projects/:id/media
router.post("/:id/media", authMiddleware, async (req: AuthedRequest, res) => {
    try {
        const { id: projectId } = req.params;
        const {
            kind,
            content_type,
            sha256,
            metadata,
            s3_key,
            is_cover,
        } = req.body ?? {};

        if (!s3_key) {
            return res.status(400).json({ error: "s3_key_required" });
        }

        // optional: ensure key is under this project (prevents cross-project linking)
        const allowedPrefix = `projects/${projectId}/media/`;
        if (!s3_key.startsWith(allowedPrefix)) {
            return res.status(400).json({ error: "s3_key_invalid_prefix" });
        }

        // build the public URL from CloudFront base
        const asset_url = `${PUBLIC_BASE_URL}/${s3_key}`;

        const sql = `
      INSERT INTO project_media (
        project_id, kind, asset_url, content_type, sha256, metadata, s3_key, is_cover
      )
      VALUES ($1,$2,$3,$4,$5,COALESCE($6,'{}'::jsonb),$7,COALESCE($8,false))
      RETURNING *
    `;

        const { rows } = await query(sql, [
            projectId,
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
        console.error("POST /projects/:id/media error", err);
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
                return res.status(400).json({ error: "project_id_required" });
            }

            const { uploadUrl, key, assetUrl } =
                await getUploadUrlForProjectMedia(id, fileExt, contentType);

            res.json({ uploadUrl, key, asset_url: assetUrl });
        } catch (err) {
            console.error("POST /projects/:id/media/upload-url error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.patch(
    "/:projectId/media/:mediaId/cover",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        const { projectId, mediaId } = req.params;

        try {
            // Clear existing cover for this project
            await query(
                `
                UPDATE project_media
                SET is_cover = false
                WHERE project_id = $1 AND is_cover = true
                `,
                [projectId]
            );

            // Set the new cover
            const { rows } = await query(
                `
                UPDATE project_media
                SET is_cover = true
                WHERE id = $1 AND project_id = $2
                RETURNING *
                `,
                [mediaId, projectId]
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
                "PATCH /projects/:projectId/media/:mediaId/cover error",
                err
            );
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.delete(
    "/:projectId/media/:mediaId",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { projectId, mediaId } = req.params;

            const sql = `
        DELETE FROM project_media
        WHERE project_id = $1 AND id = $2
        RETURNING asset_url
      `;

            const { rows } = await query(sql, [projectId, mediaId]);

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
                        "Failed to delete S3 object for project media",
                        key,
                        e
                    );
                }
            }

            res.status(204).send();
        } catch (err) {
            console.error(
                "DELETE /projects/:projectId/media/:mediaId error",
                err
            );
            res.status(500).json({ error: "internal_error" });
        }
    }
);

// --- Project documents (PDD, audit, credentials, etc.) -------------

// GET /projects/:id/documents
router.get(
    "/:id/documents",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { id } = req.params;
            const { docType } = req.query;

            const where: string[] = ["project_id = $1"];
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
          project_id,
          doc_type,
          title,
          asset_url,
          content_type,
          sha256,
          metadata,
          created_at,
          s3_key
        FROM project_documents
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
            console.error("GET /projects/:id/documents error", err);
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
                return res.status(400).json({ error: "project_id_required" });
            }

            // You can keep using the same helper; if you prefer a separate
            // path for documents, create getUploadUrlForProjectDocument().
            const { uploadUrl, key, assetUrl } = await getUploadUrlForProjectDocument(
                id,
                fileExt,
                contentType
            );

            res.json({ uploadUrl, s3_key: key, asset_url: assetUrl });
        } catch (err) {
            console.error("POST /projects/:id/documents/upload-url error", err);
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
                INSERT INTO project_documents (
                    project_id,
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
            console.error("POST /projects/:id/documents error", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);

router.delete(
    "/:projectId/documents/:documentId",
    authMiddleware,
    async (req: AuthedRequest, res) => {
        try {
            const { projectId, documentId } = req.params;

            const sql = `
                DELETE FROM project_documents
                WHERE project_id = $1 AND id = $2
                RETURNING asset_url, s3_key
                `;

            const { rows } = await query(sql, [projectId, documentId]);

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
                        "Failed to delete S3 object for project document",
                        key,
                        e
                    );
                }
            }

            res.status(204).send();
        } catch (err) {
            console.error(
                "DELETE /projects/:projectId/documents/:documentId error",
                err
            );
            res.status(500).json({ error: "internal_error" });
        }
    }
);

// --- Export router -------------------------------------------------
export default router;