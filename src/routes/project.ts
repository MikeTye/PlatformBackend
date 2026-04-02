import { Router } from "express";
import { query } from "../db/connection.js";
import {
    extractKeyFromAssetUrl, toPublicAssetUrl, getSignedReadUrlForKey,
    getUploadUrlForProjectMedia, deleteObjectByKey, getUploadUrlForProjectDocument,
    publicAssetUrlForKey
} from "../lib/s3Media.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { fetchProjectById, fetchProjectMediaByProjectId } from "../services/project.service.js";

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
        const pageSize = Math.min(
            Math.max(parseInt(String(req.query.pageSize ?? "20"), 10) || 20, 1),
            100
        );

        const q = (req.query.q as string | undefined)?.trim();
        const companyId = (req.query.companyId as string | undefined)?.trim();

        // Temporary until auth/session is properly wired
        // Use one consistent user context for scope/isSaved/isMine
        const contextUserId = (req.query.userId as string | undefined)?.trim() || null;

        const scopeRaw = String(req.query.scope ?? "all").toLowerCase();
        const scope = scopeRaw === "my" || scopeRaw === "saved" ? scopeRaw : "all";

        const includeCounts =
            String(req.query.includeCounts ?? "false").toLowerCase() === "true";

        const parseCsv = (value: unknown): string[] => {
            if (!value || typeof value !== "string") return [];
            return value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
        };

        const stages = parseCsv(req.query.stage);
        const projectTypes = parseCsv(req.query.projectType);
        const hostCountries = parseCsv(req.query.hostCountry);
        const opportunities = parseCsv(req.query.opportunity);

        const sortBy = String(req.query.sortBy ?? "updated");
        const sortDir =
            String(req.query.sortDir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

        const sortableColumns: Record<string, string> = {
            name: "p.name",
            developer: "c.name",
            stage: "p.status", // change to p.stage if you rename column
            type: "p.project_type",
            country: "p.host_country",
            updated: "p.updated_at",
        };

        const orderBy = sortableColumns[sortBy] ?? "p.updated_at";

        const where: string[] = ["p.delete_flag = false"];
        const params: unknown[] = [];
        let i = 1;

        if (q) {
            where.push(`
                (
                    p.name ILIKE $${i}
                    OR p.description ILIKE $${i}
                    OR c.name ILIKE $${i}
                    OR p.upid ILIKE $${i}
                    OR p.host_country ILIKE $${i}
                    OR p.host_region ILIKE $${i}
                )
            `);
            params.push(`%${q}%`);
            i++;
        }

        if (companyId) {
            where.push(`p.company_id = $${i}`);
            params.push(companyId);
            i++;
        }

        if (stages.length > 0) {
            where.push(`p.status = ANY($${i}::text[])`);
            params.push(stages);
            i++;
        }

        if (projectTypes.length > 0) {
            where.push(`p.project_type = ANY($${i}::text[])`);
            params.push(projectTypes);
            i++;
        }

        if (hostCountries.length > 0) {
            where.push(`p.host_country = ANY($${i}::text[])`);
            params.push(hostCountries);
            i++;
        }

        if (opportunities.length > 0) {
            where.push(`
                EXISTS (
                    SELECT 1
                    FROM project_opportunities po
                    WHERE po.project_id = p.id
                      AND po.opportunity_type = ANY($${i}::text[])
                )
            `);
            params.push(opportunities);
            i++;
        }

        // Scope filter
        if (scope === "my") {
            if (!contextUserId) {
                return res.status(400).json({
                    error: "user_id_required_for_scope_my",
                });
            }

            where.push(`p.owner_user_id = $${i}::uuid`);
            params.push(contextUserId);
            i++;
        }

        if (scope === "saved") {
            if (!contextUserId) {
                return res.status(400).json({
                    error: "user_id_required_for_scope_saved",
                });
            }

            where.push(`
                EXISTS (
                    SELECT 1
                    FROM saved_projects sp_scope
                    WHERE sp_scope.project_id = p.id
                      AND sp_scope.user_id = $${i}::uuid
                )
            `);
            params.push(contextUserId);
            i++;
        }

        const whereSQL = `WHERE ${where.join(" AND ")}`;
        const offset = (page - 1) * pageSize;

        // Reuse one param for computed flags
        const contextUserParamIndex = i;
        const limitParamIndex = i + 1;
        const offsetParamIndex = i + 2;

        const listSql = `
            SELECT
                p.id,
                p.upid,
                p.name,
                p.description,
                p.status AS stage,
                p.project_type AS type,
                p.host_country AS country,
                p.host_country_code AS country_code,
                p.host_region AS region,
                p.latitude AS lat,
                p.longitude AS lng,
                p.updated_at,
                p.created_at,
                p.company_id,
                p.owner_user_id,

                c.name AS developer,

                v.to_date_issued,
                v.to_date_offtake,
                v.to_date_retired,

                pmc.cover_media_id,
                pmc.cover_asset_url,
                pmc.cover_content_type,
                pmc.cover_s3_key,

                COALESCE((
                    SELECT json_agg(po.opportunity_type ORDER BY po.opportunity_type)
                    FROM project_opportunities po
                    WHERE po.project_id = p.id
                ), '[]'::json) AS opportunities,

                CASE
                    WHEN $${contextUserParamIndex}::uuid IS NOT NULL THEN EXISTS (
                        SELECT 1
                        FROM saved_projects sp
                        WHERE sp.project_id = p.id
                          AND sp.user_id = $${contextUserParamIndex}::uuid
                    )
                    ELSE false
                END AS is_saved,

                CASE
                    WHEN $${contextUserParamIndex}::uuid IS NOT NULL
                         AND p.owner_user_id = $${contextUserParamIndex}::uuid
                    THEN true
                    ELSE false
                END AS is_mine

            FROM projects p
            LEFT JOIN companies c
                ON c.id = p.company_id
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
                  AND (
                    (pm.asset_url IS NOT NULL AND pm.asset_url <> '')
                    OR
                    (pm.s3_key IS NOT NULL AND pm.s3_key <> '')
                  )
                ORDER BY pm.is_cover DESC, pm.created_at DESC
                LIMIT 1
            ) pmc ON true

            ${whereSQL}
            ORDER BY ${orderBy} ${sortDir}, p.id ASC
            LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
        `;

        const countSql = `
            SELECT COUNT(*)::bigint AS count
            FROM projects p
            LEFT JOIN companies c
                ON c.id = p.company_id
            ${whereSQL}
        `;

        const listParams = [...params, contextUserId, pageSize, offset];

        const [rowsRes, countRes] = await Promise.all([
            query(listSql, listParams),
            query(countSql, params),
        ]);

        const items = rowsRes.rows.map((r: any) => ({
            id: r.id,
            upid: r.upid,
            name: r.name,
            developer: r.developer,
            description: r.description,
            stage: r.stage,
            type: r.type,
            country: r.country,
            countryCode: r.country_code,
            region: r.region,
            lat: r.lat != null ? Number(r.lat) : null,
            lng: r.lng != null ? Number(r.lng) : null,
            updatedAt: r.updated_at,
            opportunities: r.opportunities ?? [],
            isSaved: Boolean(r.is_saved),
            isMine: Boolean(r.is_mine),
            coverAssetUrl: toPublicAssetUrl({
                asset_url: r.cover_asset_url,
                s3_key: r.cover_s3_key,
            }),
            creditTotals: {
                toDateIssued: r.to_date_issued,
                toDateOfftake: r.to_date_offtake,
                toDateRetired: r.to_date_retired,
            },
        }));

        const total = Number(countRes.rows[0]?.count ?? 0);

        const response: any = {
            items,
            total,
            page,
            pageSize,
            sortBy,
            sortDir: sortDir.toLowerCase(),
            scope,
        };

        if (includeCounts) {
            if (contextUserId) {
                const countsSql = `
                    SELECT
                        COUNT(*) FILTER (WHERE p.delete_flag = false) ::bigint AS all_count,
                        COUNT(*) FILTER (
                            WHERE p.delete_flag = false
                              AND p.owner_user_id = $1::uuid
                        ) ::bigint AS my_count,
                        COUNT(*) FILTER (
                            WHERE p.delete_flag = false
                              AND EXISTS (
                                  SELECT 1
                                  FROM saved_projects sp
                                  WHERE sp.project_id = p.id
                                    AND sp.user_id = $1::uuid
                              )
                        ) ::bigint AS saved_count
                    FROM projects p
                `;

                const countsRes = await query(countsSql, [contextUserId]);

                response.counts = {
                    all: Number(countsRes.rows[0]?.all_count ?? 0),
                    my: Number(countsRes.rows[0]?.my_count ?? 0),
                    saved: Number(countsRes.rows[0]?.saved_count ?? 0),
                };
            } else {
                const countsSql = `
                    SELECT COUNT(*)::bigint AS all_count
                    FROM projects p
                    WHERE p.delete_flag = false
                `;
                const countsRes = await query(countsSql);

                response.counts = {
                    all: Number(countsRes.rows[0]?.all_count ?? 0),
                    my: 0,
                    saved: 0,
                };
            }
        }

        res.json(response);
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

        const project = await fetchProjectById(id);

        if (!project) {
            return res.status(404).json({ error: "not_found" });
        }

        res.json(project);
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

        if (!id) {
            return res.status(400).json({ error: "missing_id" });
        }

        const items = await fetchProjectMediaByProjectId(id);

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

router.get("/:id/share", async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).send("Missing id");
    }

    // 1) Fetch project
    const project = await fetchProjectById(id);

    if (!project) {
        return res.status(404).send("Not found");
    }

    // 2) Fetch media separately
    const mediaItems = await fetchProjectMediaByProjectId(id);

    const name = project.name || "Project Details";
    const status = project.status || "Exploration";
    const projectType = project.project_type || project.projectType || "-";
    const sector = project.sector || "-";
    const hostCountry = project.host_country || project.hostCountry || "-";

    const images = (mediaItems || [])
        .filter((item) => item.asset_url || item.signed_url)
        .map((item) => ({
            // Prefer stable URL for crawlers
            src: item.asset_url || item.signed_url,
            isCover: item.is_cover,
        }));

    const coverImage =
        images.find((i) => i.isCover)?.src ||
        images[0]?.src ||
        "https://preview.thecarboneconomy.org/default-share.png";

    const siteBase = "https://preview.thecarboneconomy.org";
    const spaUrl = `${siteBase}/public/projects/${id}`;

    const title = `${name} (${status})`;
    const description = `${projectType} • ${sector} • ${hostCountry}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");

    res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>

<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${coverImage}" />
<meta property="og:url" content="${spaUrl}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${coverImage}" />

<meta http-equiv="refresh" content="0; url=${spaUrl}" />
</head>
<body>
<script>location.replace(${JSON.stringify(spaUrl)});</script>
</body>
</html>`);
});

// --- Export router -------------------------------------------------
export default router;