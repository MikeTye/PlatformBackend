import type { Pool } from "pg";
import type { ListUserOptionsQuery } from "./schema.js";

type UserOptionRow = {
    id: string;
    name: string;
    email: string | null;
};

export type UserOption = {
    id: string;
    name: string;
    email: string | null;
};

export type ListUserOptionsResponse = {
    items: UserOption[];
};

export class UserService {
    constructor(private readonly db: Pool) { }

    async listUserOptions(
        params: ListUserOptionsQuery
    ): Promise<ListUserOptionsResponse> {
        const q = params.q?.trim() || null;
        const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);

        const sql = `
      SELECT
        u.id,
        COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.email), ''), 'Unknown User') AS name,
        u.email
      FROM public.users_new u
      WHERE COALESCE(u.delete_flag, false) = false
        AND (
          $1::text IS NULL
          OR COALESCE(u.name, '') ILIKE '%' || $1::text || '%'
          OR COALESCE(u.email, '') ILIKE '%' || $1::text || '%'
        )
      ORDER BY
        COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.email), ''), 'Unknown User') ASC,
        u.created_at DESC
      LIMIT $2
    `;

        const { rows } = await this.db.query<UserOptionRow>(sql, [q, limit]);

        return {
            items: rows.map((row) => ({
                id: row.id,
                name: row.name,
                email: row.email,
            })),
        };
    }
}