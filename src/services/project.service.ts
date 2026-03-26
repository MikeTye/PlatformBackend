import { query } from "../db/connection.js";
import {
  extractKeyFromAssetUrl,
  getSignedReadUrlForKey,
  publicAssetUrlForKey,
} from "../lib/s3Media.js";

import type { QueryResultRow } from "pg";

export type ProjectWithTotals = Record<string, any>; // schema evolving

export async function fetchProjectById(id: string): Promise<ProjectWithTotals | null> {
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

  // Force the row type for this query only
  const { rows } = await query<QueryResultRow>(sql, [id]);

  // At this point, you're treating it as an untyped JSON-ish object
  return (rows[0] as ProjectWithTotals) ?? null;
}

export type ProjectMediaItem = Record<string, any>;

export async function fetchProjectMediaByProjectId(
  projectId: string
): Promise<ProjectMediaItem[]> {
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

  const { rows } = await query<QueryResultRow>(sql, [projectId]);

  const items = await Promise.all(
    rows.map(async (row) => {
      // Prefer explicit s3_key; otherwise derive from stored asset_url.
      const key = (row as any).s3_key || extractKeyFromAssetUrl((row as any).asset_url) || null;

      let signed_url: string | null = null;
      if (key) {
        try {
          signed_url = await getSignedReadUrlForKey(key);
        } catch (e) {
          console.error("Failed to sign S3 URL for key", key, e);
        }
      }

      const asset_url =
        (row as any).asset_url ?? (key ? publicAssetUrlForKey(key) : null);

      return {
        ...row,
        asset_url,
        signed_url, // remove if you truly don't want to return it
      } as ProjectMediaItem;
    })
  );

  return items;
}