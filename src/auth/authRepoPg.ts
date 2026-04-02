import { query } from "../db/connection.js";
import type { AuthRepo, AuthUser, CompanyInviteLookup, CompanyInvitePreview, VerifyAndConsumeOtpResult } from "./authRepo.js";

type IdRow = { id: string };

type SessionRow = {
    id: string;
    user_id: string;
    expires_at: Date | string;
    revoked_at: Date | null;
};

export const authRepoPg: AuthRepo = {
    async findUserByEmail(email: string): Promise<AuthUser | null> {
        const { rows } = await query<AuthUser>(
            `SELECT id, email, email_verified, name, avatar_url
       FROM users_new
       WHERE email = $1`,
            [email]
        );

        return rows[0] ?? null;
    },

    async findUserById(userId: string): Promise<AuthUser | null> {
        const { rows } = await query<AuthUser>(
            `SELECT id, email, email_verified, name, avatar_url
       FROM users_new
       WHERE id = $1`,
            [userId]
        );

        return rows[0] ?? null;
    },

    async createUser(input): Promise<AuthUser> {
        const { rows } = await query<AuthUser>(
            `INSERT INTO users_new (email, email_verified, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, email_verified, name, avatar_url`,
            [
                input.email,
                input.emailVerified ?? false,
                input.name ?? null,
                input.avatarUrl ?? null,
            ]
        );

        if (!rows[0]) {
            throw new Error("Failed to create user");
        }

        return rows[0];
    },

    async markEmailVerified(userId: string): Promise<void> {
        await query(
            `UPDATE users_new
       SET email_verified = true
       WHERE id = $1`,
            [userId]
        );
    },

    async updateLastLogin(userId: string): Promise<void> {
        await query(
            `UPDATE users_new
       SET last_login_at = now()
       WHERE id = $1`,
            [userId]
        );
    },

    async updateUserProfile(
        userId: string,
        input: { name?: string | null; avatarUrl?: string | null }
    ): Promise<void> {
        await query(
            `UPDATE users_new
       SET
         name = COALESCE($2, name),
         avatar_url = COALESCE($3, avatar_url)
       WHERE id = $1`,
            [userId, input.name ?? null, input.avatarUrl ?? null]
        );
    },

    async invalidateActiveCodes(email: string): Promise<void> {
        await query(
            `UPDATE auth_email_codes
       SET invalidated_at = now()
       WHERE email_normalized = $1
         AND used_at IS NULL
         AND invalidated_at IS NULL`,
            [email]
        );
    },

    async insertEmailCode(input): Promise<{ id: string }> {
        const { rows } = await query<IdRow>(
            `INSERT INTO auth_email_codes
        (email_normalized, user_id, intent, code_hash, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
            [
                input.emailNormalized,
                input.userId,
                input.intent,
                input.codeHash,
                input.expiresAt,
                input.ip ?? null,
                input.userAgent ?? null,
            ]
        );

        if (!rows[0]) {
            throw new Error("Failed to insert email code");
        }

        return rows[0];
    },

    async verifyAndConsumeOtp(
        email: string,
        codeHash: string
    ): Promise<VerifyAndConsumeOtpResult> {
        const { rows } = await query<{
            ok: boolean;
            reason: "invalid" | "expired" | "too_many_attempts" | null;
            user_id: string | null;
        }>(
            `
      WITH latest AS (
        SELECT
          id,
          user_id,
          code_hash,
          expires_at,
          attempt_count,
          max_attempts
        FROM auth_email_codes
        WHERE email_normalized = $1
          AND used_at IS NULL
          AND invalidated_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      ),
      updated AS (
        UPDATE auth_email_codes ec
        SET
          attempt_count = ec.attempt_count + 1,
          used_at = CASE
            WHEN l.code_hash = $2
             AND l.expires_at > now()
             AND (l.attempt_count + 1) <= l.max_attempts
            THEN now()
            ELSE ec.used_at
          END,
          invalidated_at = CASE
            WHEN l.expires_at <= now()
              OR (l.attempt_count + 1) >= l.max_attempts
            THEN now()
            ELSE ec.invalidated_at
          END
        FROM latest l
        WHERE ec.id = l.id
        RETURNING
          l.user_id,
          l.code_hash = $2 AS hash_match,
          l.expires_at > now() AS not_expired,
          (l.attempt_count + 1) <= l.max_attempts AS within_attempts
      )
      SELECT
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM latest) THEN false
          WHEN EXISTS (
            SELECT 1 FROM updated
            WHERE hash_match = true
              AND not_expired = true
              AND within_attempts = true
          ) THEN true
          ELSE false
        END AS ok,
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM latest) THEN 'invalid'
          WHEN EXISTS (
            SELECT 1 FROM updated
            WHERE hash_match = false
          ) THEN 'invalid'
          WHEN EXISTS (
            SELECT 1 FROM updated
            WHERE not_expired = false
          ) THEN 'expired'
          WHEN EXISTS (
            SELECT 1 FROM updated
            WHERE within_attempts = false
          ) THEN 'too_many_attempts'
          ELSE NULL
        END AS reason,
        (SELECT user_id FROM updated LIMIT 1) AS user_id
      `,
            [email, codeHash]
        );

        const row = rows[0];
        if (!row) {
            return { ok: false, reason: "invalid" };
        }

        if (row.ok) {
            return { ok: true, userId: row.user_id };
        }

        return { ok: false, reason: row.reason ?? "invalid" };
    },

    async insertSession(input): Promise<{ id: string }> {
        const { rows } = await query<IdRow>(
            `INSERT INTO sessions
        (user_id, session_token_hash, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
            [
                input.userId,
                input.sessionTokenHash,
                input.expiresAt,
                input.ip ?? null,
                input.userAgent ?? null,
            ]
        );

        if (!rows[0]) {
            throw new Error("Failed to insert session");
        }

        return rows[0];
    },

    async findSessionByHash(sessionTokenHash: string): Promise<SessionRow | null> {
        const { rows } = await query<SessionRow>(
            `SELECT id, user_id, expires_at, revoked_at
       FROM sessions
       WHERE session_token_hash = $1`,
            [sessionTokenHash]
        );

        return rows[0] ?? null;
    },

    async revokeSession(sessionId: string): Promise<void> {
        await query(
            `UPDATE sessions
       SET revoked_at = now()
       WHERE id = $1`,
            [sessionId]
        );
    },

    async findActiveCompanyInviteByToken(token: string): Promise<CompanyInviteLookup | null> {
        const sql = `
    select
      cil.id as invite_link_id,
      cil.company_id,
      cil.is_active,
      c.display_name
    from company_invite_links cil
    join companies c on c.id = cil.company_id
    where cil.token = $1
      and cil.is_active = true
    limit 1
  `;

        const { rows } = await query(sql, [token]);

        if (!rows[0]) return null;

        return {
            inviteLinkId: rows[0].invite_link_id,
            companyId: rows[0].company_id,
            companySlug: rows[0].slug ?? null,
            companyDisplayName: rows[0].display_name ?? null,
            isActive: rows[0].is_active,
        };
    },

    async addCompanyUserIfMissing(input: {
        companyId: string;
        userId: string;
        permission: string;
        role?: string | null;
    }): Promise<void> {
        const sql = `
    insert into company_users (
      company_id,
      user_id,
      permission,
      role,
      delete_flag,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, false, now(), now())
    on conflict (company_id, user_id)
    do update set
      delete_flag = false,
      permission = excluded.permission,
      updated_at = now()
  `;

        await query(sql, [
            input.companyId,
            input.userId,
            input.permission,
            input.role ?? null,
        ]);
    },

    async insertCompanyInviteEvent(input: {
        inviteLinkId: string;
        companyId: string;
        eventType: string;
        invitedUserId?: string | null;
        email?: string | null;
        sessionKey?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
        referrer?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<void> {
        const sql = `
    insert into company_invite_events (
      invite_link_id,
      company_id,
      event_type,
      invited_user_id,
      email,
      session_key,
      ip_address,
      user_agent,
      referrer,
      metadata
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
  `;

        await query(sql, [
            input.inviteLinkId,
            input.companyId,
            input.eventType,
            input.invitedUserId ?? null,
            input.email ?? null,
            input.sessionKey ?? null,
            input.ipAddress ?? null,
            input.userAgent ?? null,
            input.referrer ?? null,
            JSON.stringify(input.metadata ?? {}),
        ]);
    },

    async previewCompanyInviteByToken(token: string): Promise<CompanyInvitePreview | null> {
        const sql = `
            select
              cil.token,
              cil.company_id,
              cil.is_active,
              c.display_name
            from company_invite_links cil
            join companies c on c.id = cil.company_id
            where cil.token = $1
              and cil.is_active = true
              and coalesce(c.delete_flag, false) = false
            limit 1
        `;

        const { rows } = await query(sql, [token.trim()]);

        if (!rows[0]) return null;

        return {
            token: rows[0].token,
            companyId: rows[0].company_id,
            companySlug: rows[0].slug ?? null,
            companyDisplayName: rows[0].display_name ?? null,
            isActive: rows[0].is_active,
        };
    }
};