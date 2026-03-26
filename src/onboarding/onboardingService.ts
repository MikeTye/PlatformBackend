import type { Pool } from "pg";
import {
    ONBOARDING_ROLES,
    type MyOnboardingDto,
    type OnboardingRole,
    type UpdateMyOnboardingInput,
} from "../onboarding/schema.js";

const ONBOARDING_ROLE_SET = new Set<string>(ONBOARDING_ROLES);

function isOnboardingRole(value: string): value is OnboardingRole {
    return ONBOARDING_ROLE_SET.has(value);
}

type UserProfileOnboardingRow = {
    onboarding_selected_roles: string[] | null;
    onboarding_step: number | null;
    onboarding_status: string | null;
    onboarding_company_created: boolean | null;
    onboarding_project_created: boolean | null;
    onboarding_draft: Record<string, unknown> | null;
    onboarding_started_at: Date | string | null;
    onboarding_last_seen_at: Date | string | null;
    onboarding_completed_at: Date | string | null;
};

const DEFAULT_ONBOARDING: MyOnboardingDto = {
    onboardingSelectedRoles: [],
    onboardingStep: 0,
    onboardingStatus: "not_started",
    onboardingCompanyCreated: false,
    onboardingProjectCreated: false,
    onboardingDraft: {},
    onboardingStartedAt: null,
    onboardingLastSeenAt: null,
    onboardingCompletedAt: null,
};

function toIsoOrNull(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRowToDto(row?: UserProfileOnboardingRow | null): MyOnboardingDto {
    if (!row) return DEFAULT_ONBOARDING;

    return {
        onboardingSelectedRoles: Array.isArray(row.onboarding_selected_roles)
            ? row.onboarding_selected_roles.filter(isOnboardingRole)
            : [],
        onboardingStep:
            typeof row.onboarding_step === "number" ? row.onboarding_step : 0,
        onboardingStatus:
            row.onboarding_status === "not_started" ||
                row.onboarding_status === "in_progress" ||
                row.onboarding_status === "completed" ||
                row.onboarding_status === "skipped"
                ? row.onboarding_status
                : "not_started",
        onboardingCompanyCreated: Boolean(row.onboarding_company_created),
        onboardingProjectCreated: Boolean(row.onboarding_project_created),
        onboardingDraft:
            row.onboarding_draft && typeof row.onboarding_draft === "object"
                ? row.onboarding_draft
                : {},
        onboardingStartedAt: toIsoOrNull(row.onboarding_started_at),
        onboardingLastSeenAt: toIsoOrNull(row.onboarding_last_seen_at),
        onboardingCompletedAt: toIsoOrNull(row.onboarding_completed_at),
    };
}

export class OnboardingService {
    constructor(private readonly db: Pool) { }

    async getMyOnboarding(userId: string): Promise<MyOnboardingDto> {
        const result = await this.db.query<UserProfileOnboardingRow>(
            `
      SELECT
        onboarding_selected_roles,
        onboarding_step,
        onboarding_status,
        onboarding_company_created,
        onboarding_project_created,
        onboarding_draft,
        onboarding_started_at,
        onboarding_last_seen_at,
        onboarding_completed_at
      FROM public.user_profiles
      WHERE user_id = $1
        AND delete_flag = false
      LIMIT 1
      `,
            [userId]
        );

        return mapRowToDto(result.rows[0]);
    }

    async updateMyOnboarding(
        userId: string,
        input: UpdateMyOnboardingInput
    ): Promise<MyOnboardingDto> {
        const result = await this.db.query<UserProfileOnboardingRow>(
            `
      INSERT INTO public.user_profiles (
        user_id,
        onboarding_selected_roles,
        onboarding_step,
        onboarding_status,
        onboarding_company_created,
        onboarding_project_created,
        onboarding_draft,
        onboarding_started_at,
        onboarding_last_seen_at,
        onboarding_completed_at
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4, 'not_started'),
        COALESCE($5, false),
        COALESCE($6, false),
        COALESCE($7::jsonb, '{}'::jsonb),
        CASE
          WHEN COALESCE($4, 'not_started') IN ('in_progress', 'completed', 'skipped')
          THEN now()
          ELSE NULL
        END,
        now(),
        CASE
          WHEN $4 = 'completed' THEN now()
          ELSE NULL
        END
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        onboarding_selected_roles = COALESCE(
          EXCLUDED.onboarding_selected_roles,
          public.user_profiles.onboarding_selected_roles
        ),
        onboarding_step = COALESCE(
          EXCLUDED.onboarding_step,
          public.user_profiles.onboarding_step
        ),
        onboarding_status = COALESCE(
          EXCLUDED.onboarding_status,
          public.user_profiles.onboarding_status
        ),
        onboarding_company_created = COALESCE(
          EXCLUDED.onboarding_company_created,
          public.user_profiles.onboarding_company_created
        ),
        onboarding_project_created = COALESCE(
          EXCLUDED.onboarding_project_created,
          public.user_profiles.onboarding_project_created
        ),
        onboarding_draft = COALESCE(
          EXCLUDED.onboarding_draft,
          public.user_profiles.onboarding_draft
        ),
        onboarding_started_at = CASE
          WHEN public.user_profiles.onboarding_started_at IS NULL
            AND COALESCE(EXCLUDED.onboarding_status, public.user_profiles.onboarding_status)
              IN ('in_progress', 'completed', 'skipped')
          THEN now()
          ELSE public.user_profiles.onboarding_started_at
        END,
        onboarding_last_seen_at = now(),
        onboarding_completed_at = CASE
          WHEN COALESCE(EXCLUDED.onboarding_status, public.user_profiles.onboarding_status) = 'completed'
          THEN COALESCE(public.user_profiles.onboarding_completed_at, now())
          ELSE public.user_profiles.onboarding_completed_at
        END,
        updated_at = now()
      WHERE public.user_profiles.delete_flag = false
      RETURNING
        onboarding_selected_roles,
        onboarding_step,
        onboarding_status,
        onboarding_company_created,
        onboarding_project_created,
        onboarding_draft,
        onboarding_started_at,
        onboarding_last_seen_at,
        onboarding_completed_at
      `,
            [
                userId,
                input.onboardingSelectedRoles ?? null,
                typeof input.onboardingStep === "number" ? input.onboardingStep : null,
                input.onboardingStatus ?? null,
                typeof input.onboardingCompanyCreated === "boolean"
                    ? input.onboardingCompanyCreated
                    : null,
                typeof input.onboardingProjectCreated === "boolean"
                    ? input.onboardingProjectCreated
                    : null,
                input.onboardingDraft ? JSON.stringify(input.onboardingDraft) : null,
            ]
        );

        if (result.rows.length === 0) {
            throw new Error("Failed to persist onboarding state for user profile.");
        }

        return mapRowToDto(result.rows[0]);
    }
}