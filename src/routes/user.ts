import { Router } from "express";
import { query } from "../db/connection.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import {
  deleteObjectByKey,
  extractKeyFromAssetUrl,
  getUploadUrlForUserMedia,
} from "../lib/s3Media.js";

const router = Router();
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

type UserProfileRow = {
  id: string;
  user_id: string;

  full_name: string | null;
  headline: string | null;
  job_title: string | null;
  company_id: string | null;
  org_name: string | null;

  country: string | null;
  city: string | null;
  timezone: string | null;
  role_type: string | null;

  expertise_tags: string[];
  service_offerings: string[];
  sectors: string[];
  standards: string[];
  languages: string[];

  personal_website: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;

  contact_email: string | null;
  phone_number: string | null;

  is_public: boolean;
  show_phone: boolean;
  show_contact_email: boolean;

  is_verified: boolean;
  verification_level: string | null;
  verification_notes: string | null;

  bio: string | null;

  created_at: string;
  updated_at: string;

  delete_flag: boolean;
};

async function requireAuth(req: AuthedRequest) {
  if (!req.user?.id) {
    const err: any = new Error("unauthorized");
    err.status = 401;
    throw err;
  }
  return req.user.id as string;
}

// ───────────────────────── Directory list (public) ─────────────────────────
// GET /users?q=&country=&roleType=&expertiseTag=&sector=&standard=&language=&page=&pageSize=
router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const country = String(req.query.country ?? "").trim();
    const roleType = String(req.query.roleType ?? "").trim();
    const expertiseTag = String(req.query.expertiseTag ?? "").trim();
    const sector = String(req.query.sector ?? "").trim();
    const standard = String(req.query.standard ?? "").trim();
    const language = String(req.query.language ?? "").trim();

    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 10)));
    const offset = (page - 1) * pageSize;

    const where: string[] = ["up.delete_flag = false", "up.is_public = true"];
    const params: any[] = [];
    let idx = 1;

    if (q) {
      // keep it simple + index-friendly later (tsvector optional)
      where.push(
        `(up.full_name ILIKE $${idx} OR up.headline ILIKE $${idx} OR up.job_title ILIKE $${idx} OR up.org_name ILIKE $${idx} OR up.bio ILIKE $${idx})`
      );
      params.push(`%${q}%`);
      idx++;
    }
    if (country) {
      where.push(`up.country = $${idx}`);
      params.push(country);
      idx++;
    }
    if (roleType) {
      where.push(`up.role_type = $${idx}`);
      params.push(roleType);
      idx++;
    }
    if (expertiseTag) {
      where.push(`up.expertise_tags @> ARRAY[$${idx}]::text[]`);
      params.push(expertiseTag);
      idx++;
    }
    if (sector) {
      where.push(`up.sectors @> ARRAY[$${idx}]::text[]`);
      params.push(sector);
      idx++;
    }
    if (standard) {
      where.push(`up.standards @> ARRAY[$${idx}]::text[]`);
      params.push(standard);
      idx++;
    }
    if (language) {
      where.push(`up.languages @> ARRAY[$${idx}]::text[]`);
      params.push(language);
      idx++;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const listSql = `
      SELECT
        up.id,
        up.user_id,
        up.full_name,
        up.headline,
        up.job_title,
        up.company_id,
        COALESCE(c.legal_name, up.org_name) AS org_display_name,
        up.country,
        up.city,
        up.timezone,
        up.role_type,
        up.expertise_tags,
        up.service_offerings,
        up.sectors,
        up.standards,
        up.languages,
        up.personal_website,
        up.linkedin_url,
        up.portfolio_url,
        up.is_verified,
        up.verification_level,
        up.bio,
        up.created_at,
        up.updated_at,
        umc.avatar_media_id,
        umc.avatar_asset_url,
        umc.avatar_content_type
      FROM user_profiles up
      LEFT JOIN companies c ON c.id = up.company_id
      LEFT JOIN LATERAL (
        SELECT
          um.id AS avatar_media_id,
          um.asset_url AS avatar_asset_url,
          um.content_type AS avatar_content_type
        FROM user_media um
        WHERE um.user_id = up.user_id AND um.is_avatar = true
        ORDER BY um.created_at DESC
        LIMIT 1
      ) umc ON true
      ${whereSql}
      ORDER BY up.is_verified DESC, up.updated_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const countSql = `
      SELECT COUNT(*)::text AS count
      FROM user_profiles up
      ${whereSql}
    `;

    const listParams = [...params, pageSize, offset];

    const [rowsRes, countRes] = await Promise.all([
      query(listSql, listParams),
      query<{ count: string }>(countSql, params),
    ]);

    const total = Number(countRes.rows[0]?.count ?? 0);

    res.json({
      items: rowsRes.rows.map((r: any) => ({
        ...r,
        // keep a consistent public url if s3_key missing but asset_url has it
        avatar_asset_url:
          r.avatar_asset_url ??
          (r.avatar_media_id
            ? null
            : null),
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("GET /users error", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ───────────────────────── Public profile ─────────────────────────
// GET /users/:userId
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { rows } = await query(
      `
      SELECT
        up.*,
        c.legal_name AS company_legal_name,
        COALESCE(c.legal_name, up.org_name) AS org_display_name,
        umc.avatar_media_id,
        umc.avatar_asset_url,
        umc.avatar_content_type
      FROM user_profiles up
      LEFT JOIN companies c ON c.id = up.company_id
      LEFT JOIN LATERAL (
        SELECT
          um.id AS avatar_media_id,
          um.asset_url AS avatar_asset_url,
          um.content_type AS avatar_content_type
        FROM user_media um
        WHERE um.user_id = up.user_id AND um.is_avatar = true
        ORDER BY um.created_at DESC
        LIMIT 1
      ) umc ON true
      WHERE up.user_id = $1 AND up.delete_flag = false AND up.is_public = true
      LIMIT 1
      `,
      [userId]
    );

    if (!rows[0]) return res.status(404).json({ error: "not_found" });

    const row: any = rows[0];

    // enforce contact visibility for public reads
    if (!row.show_phone) row.phone_number = null;
    if (!row.show_contact_email) row.contact_email = null;

    res.json(row);
  } catch (err) {
    console.error("GET /users/:userId error", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ───────────────────────── My profile (full) ─────────────────────────
// GET /users/me/profile
router.get("/me/profile", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);

    const { rows } = await query(
      `
      SELECT up.*,
        c.legal_name AS company_legal_name,
        COALESCE(c.legal_name, up.org_name) AS org_display_name,
        umc.avatar_media_id,
        umc.avatar_asset_url,
        umc.avatar_content_type
      FROM user_profiles up
      LEFT JOIN companies c ON c.id = up.company_id
      LEFT JOIN LATERAL (
        SELECT
          um.id AS avatar_media_id,
          um.asset_url AS avatar_asset_url,
          um.content_type AS avatar_content_type
        FROM user_media um
        WHERE um.user_id = up.user_id AND um.is_avatar = true
        ORDER BY um.created_at DESC
        LIMIT 1
      ) umc ON true
      WHERE up.user_id = $1 AND up.delete_flag = false
      LIMIT 1
      `,
      [userId]
    );

    if (!rows[0]) return res.json(null);
    res.json(rows[0]);
  } catch (err: any) {
    console.error("GET /users/me/profile error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

// PATCH /users/me/profile (upsert)
router.patch("/me/profile", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);

    const b = req.body ?? {};

    const {
      full_name,
      headline,
      job_title,
      company_id,
      org_name,

      country,
      city,
      timezone,
      role_type,

      expertise_tags,
      service_offerings,
      sectors,
      standards,
      languages,

      personal_website,
      linkedin_url,
      portfolio_url,

      contact_email,
      phone_number,
      is_public,
      show_phone,
      show_contact_email,

      bio,
    } = b;

    const { rows } = await query<UserProfileRow>(
      `
      INSERT INTO user_profiles (
        user_id,
        full_name, headline, job_title, company_id, org_name,
        country, city, timezone, role_type,
        expertise_tags, service_offerings, sectors, standards, languages,
        personal_website, linkedin_url, portfolio_url,
        contact_email, phone_number,
        is_public, show_phone, show_contact_email,
        bio,
        updated_at,
        delete_flag
      ) VALUES (
        $1,
        $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        COALESCE($11::text[], '{}'::text[]),
        COALESCE($12::text[], '{}'::text[]),
        COALESCE($13::text[], '{}'::text[]),
        COALESCE($14::text[], '{}'::text[]),
        COALESCE($15::text[], '{}'::text[]),
        $16, $17, $18,
        $19, $20,
        COALESCE($21::boolean, true),
        COALESCE($22::boolean, false),
        COALESCE($23::boolean, false),
        $24,
        now(),
        false
      )
      ON CONFLICT (user_id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
        headline = COALESCE(EXCLUDED.headline, user_profiles.headline),
        job_title = COALESCE(EXCLUDED.job_title, user_profiles.job_title),
        company_id = EXCLUDED.company_id,
        org_name = COALESCE(EXCLUDED.org_name, user_profiles.org_name),

        country = COALESCE(EXCLUDED.country, user_profiles.country),
        city = COALESCE(EXCLUDED.city, user_profiles.city),
        timezone = COALESCE(EXCLUDED.timezone, user_profiles.timezone),
        role_type = COALESCE(EXCLUDED.role_type, user_profiles.role_type),

        expertise_tags = COALESCE(EXCLUDED.expertise_tags, user_profiles.expertise_tags),
        service_offerings = COALESCE(EXCLUDED.service_offerings, user_profiles.service_offerings),
        sectors = COALESCE(EXCLUDED.sectors, user_profiles.sectors),
        standards = COALESCE(EXCLUDED.standards, user_profiles.standards),
        languages = COALESCE(EXCLUDED.languages, user_profiles.languages),

        personal_website = COALESCE(EXCLUDED.personal_website, user_profiles.personal_website),
        linkedin_url = COALESCE(EXCLUDED.linkedin_url, user_profiles.linkedin_url),
        portfolio_url = COALESCE(EXCLUDED.portfolio_url, user_profiles.portfolio_url),

        contact_email = COALESCE(EXCLUDED.contact_email, user_profiles.contact_email),
        phone_number = COALESCE(EXCLUDED.phone_number, user_profiles.phone_number),

        is_public = COALESCE(EXCLUDED.is_public, user_profiles.is_public),
        show_phone = COALESCE(EXCLUDED.show_phone, user_profiles.show_phone),
        show_contact_email = COALESCE(EXCLUDED.show_contact_email, user_profiles.show_contact_email),

        bio = COALESCE(EXCLUDED.bio, user_profiles.bio),
        updated_at = now(),
        delete_flag = false
      RETURNING *
      `,
      [
        userId,
        full_name ?? null,
        headline ?? null,
        job_title ?? null,
        company_id ?? null,
        org_name ?? null,

        country ?? null,
        city ?? null,
        timezone ?? null,
        role_type ?? null,

        expertise_tags ?? null,
        service_offerings ?? null,
        sectors ?? null,
        standards ?? null,
        languages ?? null,

        personal_website ?? null,
        linkedin_url ?? null,
        portfolio_url ?? null,

        contact_email ?? null,
        phone_number ?? null,

        typeof is_public === "boolean" ? is_public : null,
        typeof show_phone === "boolean" ? show_phone : null,
        typeof show_contact_email === "boolean" ? show_contact_email : null,

        bio ?? null,
      ]
    );

    res.json(rows[0]);
  } catch (err: any) {
    console.error("PATCH /users/me/profile error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

// DELETE /users/me/profile (soft delete)
router.delete("/me/profile", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);

    await query(
      `
      UPDATE user_profiles
      SET delete_flag = true, is_public = false, updated_at = now()
      WHERE user_id = $1
      `,
      [userId]
    );

    res.status(204).send();
  } catch (err: any) {
    console.error("DELETE /users/me/profile error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

// ───────────────────────── User media (avatar + gallery) ─────────────────────────

// GET /users/me/media
router.get("/me/media", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);

    const { rows } = await query(
      `
      SELECT
        id,
        user_id,
        kind,
        asset_url,
        content_type,
        sha256,
        metadata,
        s3_key,
        is_avatar,
        created_at
      FROM user_media
      WHERE user_id = $1
      ORDER BY is_avatar DESC, created_at DESC
      `,
      [userId]
    );

    const items = rows.map((row: any) => {
      const key = row.s3_key || extractKeyFromAssetUrl(row.asset_url) || null;
      return {
        ...row,
        asset_url: row.asset_url ?? (key ? `${PUBLIC_BASE_URL}/${key}` : null),
      };
    });

    res.json({ items });
  } catch (err: any) {
    console.error("GET /users/me/media error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

// POST /users/me/media/upload-url
router.post("/me/media/upload-url", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);

    const { fileExt, contentType } = req.body ?? {};
    if (!fileExt || !contentType) {
      return res.status(400).json({ error: "fileExt_and_contentType_required" });
    }

    const { uploadUrl, key, assetUrl } = await getUploadUrlForUserMedia(userId, fileExt, contentType);
    res.json({ uploadUrl, key, asset_url: assetUrl });
  } catch (err: any) {
    console.error("POST /users/me/media/upload-url error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

// POST /users/me/media  (create DB row after upload)
router.post("/me/media", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);

    const { kind, asset_url, content_type, sha256, metadata, s3_key, is_avatar } = req.body ?? {};
    if (!asset_url && !s3_key) return res.status(400).json({ error: "asset_url_or_s3_key_required" });

    const finalAssetUrl =
      asset_url ?? (PUBLIC_BASE_URL && s3_key ? `${PUBLIC_BASE_URL}/${s3_key}` : null);

    if (!finalAssetUrl) return res.status(400).json({ error: "asset_url_required" });

    // if setting avatar, clear existing first
    if (is_avatar === true) {
      await query(
        `UPDATE user_media SET is_avatar = false WHERE user_id = $1 AND is_avatar = true`,
        [userId]
      );
    }

    const { rows } = await query(
      `
      INSERT INTO user_media (
        user_id, kind, asset_url, content_type, sha256, metadata, s3_key, is_avatar
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        userId,
        kind ?? null,
        finalAssetUrl,
        content_type ?? null,
        sha256 ?? null,
        metadata ?? {},
        s3_key ?? extractKeyFromAssetUrl(finalAssetUrl) ?? null,
        is_avatar ?? false,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error("POST /users/me/media error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

// PATCH /users/me/media/:mediaId/avatar
router.patch("/me/media/:mediaId/avatar", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);
    const { mediaId } = req.params;

    await query(`UPDATE user_media SET is_avatar = false WHERE user_id = $1 AND is_avatar = true`, [
      userId,
    ]);

    const { rows } = await query(
      `
      UPDATE user_media
      SET is_avatar = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
      `,
      [mediaId, userId]
    );

    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err: any) {
    console.error("PATCH /users/me/media/:mediaId/avatar error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

// DELETE /users/me/media/:mediaId
router.delete("/me/media/:mediaId", authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = await requireAuth(req);
    const { mediaId } = req.params;

    const { rows } = await query(
      `SELECT id, s3_key, asset_url FROM user_media WHERE id = $1 AND user_id = $2`,
      [mediaId, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });

    const key = rows[0].s3_key || extractKeyFromAssetUrl(rows[0].asset_url) || null;

    await query(`DELETE FROM user_media WHERE id = $1 AND user_id = $2`, [mediaId, userId]);

    if (key) {
      try {
        await deleteObjectByKey(key);
      } catch (e) {
        // DB delete already succeeded; don't fail hard
        console.warn("deleteObjectByKey failed", e);
      }
    }

    res.status(204).send();
  } catch (err: any) {
    console.error("DELETE /users/me/media/:mediaId error", err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? "internal_error" });
  }
});

export default router;