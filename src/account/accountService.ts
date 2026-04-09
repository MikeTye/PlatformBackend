import type { Pool, PoolClient } from "pg";
import type { AccountProfileInput } from "./schema.js";

type Queryable = Pool | PoolClient;

export type AccountCompanyAffiliation = {
    id?: string;
    companyId: string | null;
    companyName: string;
    role: string;
    permission: "creator" | "viewer";
};

export type AccountProjectAffiliation = {
    id?: string;
    projectId: string;
    projectName: string;
    stage: string;
    type: string;
    country: string;
    role: string;
    permission: "creator" | "viewer";
    memberType: "user" | "company";
    source: "direct" | "company";
    companyId: string | null;
    companyName: string;
};

export type AccountResponse = {
    user: {
        id: string;
        email: string;
    };
    profile: {
        fullName: string;
        headline: string;
        jobTitle: string;
        bio: string;
        phoneNumber: string;
        contactEmail: string;
        country: string;
        city: string;
        timezone: string;
        roleType: string;
        expertiseTags: string[];
        serviceOfferings: string[];
        sectors: string[];
        standards: string[];
        languages: string[];
        personalWebsite: string;
        linkedinUrl: string;
        portfolioUrl: string;
        isPublic: boolean;
        showPhone: boolean;
        showContactEmail: boolean;
    };
    affiliations: AccountCompanyAffiliation[];
    stats: {
        companyCount: number;
        projectCount: number;
    };
};

type UserRow = {
    id: string;
    email: string;
};

type ProfileRow = {
    full_name: string | null;
    headline: string | null;
    job_title: string | null;
    bio: string | null;
    phone_number: string | null;
    contact_email: string | null;
    country: string | null;
    city: string | null;
    timezone: string | null;
    role_type: string | null;
    expertise_tags: string[] | null;
    service_offerings: string[] | null;
    sectors: string[] | null;
    standards: string[] | null;
    languages: string[] | null;
    personal_website: string | null;
    linkedin_url: string | null;
    portfolio_url: string | null;
    is_public: boolean | null;
    show_phone: boolean | null;
    show_contact_email: boolean | null;
};

type CompanyAffiliationRow = {
    id: string;
    company_id: string;
    company_name: string | null;
    role: string | null;
    permission: "creator" | "viewer";
};

type ProjectAffiliationRow = {
    id: string;
    project_id: string;
    project_name: string | null;
    stage: string | null;
    project_type: string | null;
    host_country: string | null;
    role: string | null;
    permission: "creator" | "viewer";
    member_type: "user" | "company";
    source: "direct" | "company";
    company_id: string | null;
    company_name: string | null;
};

export class AccountService {
    constructor(private readonly db: Pool) { }

    private mapAccount(
        user: UserRow,
        profile: ProfileRow | null | undefined,
        affiliations: AccountCompanyAffiliation[],
        projectCount: number
    ): AccountResponse {
        return {
            user: {
                id: user.id,
                email: user.email,
            },
            profile: {
                fullName: profile?.full_name ?? "",
                headline: profile?.headline ?? "",
                jobTitle: profile?.job_title ?? "",
                bio: profile?.bio ?? "",
                phoneNumber: profile?.phone_number ?? "",
                contactEmail: profile?.contact_email ?? "",
                country: profile?.country ?? "",
                city: profile?.city ?? "",
                timezone: profile?.timezone ?? "Asia/Kuala_Lumpur",
                roleType: profile?.role_type ?? "",
                expertiseTags: profile?.expertise_tags ?? [],
                serviceOfferings: profile?.service_offerings ?? [],
                sectors: profile?.sectors ?? [],
                standards: profile?.standards ?? [],
                languages: profile?.languages ?? [],
                personalWebsite: profile?.personal_website ?? "",
                linkedinUrl: profile?.linkedin_url ?? "",
                portfolioUrl: profile?.portfolio_url ?? "",
                isPublic: profile?.is_public ?? true,
                showPhone: profile?.show_phone ?? false,
                showContactEmail: profile?.show_contact_email ?? false,
            },
            affiliations,
            stats: {
                companyCount: affiliations.length,
                projectCount,
            },
        };
    }

    private async getUserOrThrow(q: Queryable, userId: string): Promise<UserRow> {
        const userResult = await q.query<UserRow>(
            `
            SELECT id, email
            FROM public.users_new
            WHERE id = $1
              AND COALESCE(delete_flag, false) = false
            LIMIT 1
            `,
            [userId]
        );

        const user = userResult.rows[0];
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }

        return user;
    }

    private async getProfileRow(q: Queryable, userId: string): Promise<ProfileRow | null> {
        const profileResult = await q.query<ProfileRow>(
            `
            SELECT
              full_name,
              headline,
              job_title,
              bio,
              phone_number,
              contact_email,
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
              is_public,
              show_phone,
              show_contact_email
            FROM public.user_profiles
            WHERE user_id = $1
              AND COALESCE(delete_flag, false) = false
            LIMIT 1
            `,
            [userId]
        );

        return profileResult.rows[0] ?? null;
    }

    private async assertPublicProfileAccessible(q: Queryable, userId: string): Promise<{
        user: UserRow;
        profile: ProfileRow | null;
    }> {
        const user = await this.getUserOrThrow(q, userId);
        const profile = await this.getProfileRow(q, userId);

        if (profile && profile.is_public === false) {
            throw new Error("PROFILE_NOT_PUBLIC");
        }

        return { user, profile };
    }

    private async listCompanyAffiliations(q: Queryable, userId: string): Promise<AccountCompanyAffiliation[]> {
        const result = await q.query<CompanyAffiliationRow>(
            `
            SELECT
              cu.id,
              cu.company_id,
              c.display_name AS company_name, -- change to c.legal_name if that is your canonical company label
              cu.role,
              cu.permission
            FROM public.company_users cu
            JOIN public.companies c
              ON c.id = cu.company_id
            WHERE cu.user_id = $1
              AND COALESCE(cu.delete_flag, false) = false
              AND COALESCE(c.delete_flag, false) = false
            ORDER BY
              CASE WHEN cu.permission = 'creator' THEN 0 ELSE 1 END,
              c.created_at DESC,
              cu.created_at DESC
            `,
            [userId]
        );

        return result.rows.map((row) => ({
            id: row.id,
            companyId: row.company_id,
            companyName: row.company_name ?? "",
            role: row.role ?? "",
            permission: row.permission,
        }));
    }

    private async listProjectAffiliations(q: Queryable, userId: string): Promise<AccountProjectAffiliation[]> {
        const result = await q.query<ProjectAffiliationRow>(
            `
            WITH direct_memberships AS (
              SELECT
                pu.id,
                pu.project_id,
                pu.role,
                pu.permission,
                pu.member_type,
                'direct'::text AS source,
                NULL::uuid AS company_id,
                NULL::text AS company_name,
                0 AS source_rank
              FROM public.project_users pu
              WHERE pu.member_type = 'user'
                AND pu.member_user_id = $1
                AND COALESCE(pu.delete_flag, false) = false
            ),
            company_memberships AS (
              SELECT
                pu.id,
                pu.project_id,
                pu.role,
                pu.permission,
                pu.member_type,
                'company'::text AS source,
                cu.company_id,
                c.display_name AS company_name, -- change to c.legal_name if needed
                1 AS source_rank
              FROM public.company_users cu
              JOIN public.companies c
                ON c.id = cu.company_id
              JOIN public.project_users pu
                ON pu.member_type = 'company'
               AND pu.member_company_id = cu.company_id
              WHERE cu.user_id = $1
                AND COALESCE(cu.delete_flag, false) = false
                AND COALESCE(c.delete_flag, false) = false
                AND COALESCE(pu.delete_flag, false) = false
            ),
            combined AS (
              SELECT *
              FROM direct_memberships
              UNION ALL
              SELECT *
              FROM company_memberships
            ),
            ranked AS (
              SELECT
                combined.*,
                ROW_NUMBER() OVER (
                  PARTITION BY combined.project_id
                  ORDER BY
                    combined.source_rank ASC,
                    CASE WHEN combined.permission = 'creator' THEN 0 ELSE 1 END,
                    combined.id
                ) AS rn
              FROM combined
            )
            SELECT
              r.id,
              r.project_id,
              p.name AS project_name,
              p.stage,
              p.project_type,
              p.host_country,
              r.role,
              r.permission,
              r.member_type,
              r.source,
              r.company_id,
              r.company_name
            FROM ranked r
            JOIN public.projects p
              ON p.id = r.project_id
            WHERE r.rn = 1
              AND COALESCE(p.delete_flag, false) = false
            ORDER BY p.created_at DESC, r.id
            `,
            [userId]
        );

        return result.rows.map((row) => ({
            id: row.id,
            projectId: row.project_id,
            projectName: row.project_name ?? "",
            stage: row.stage ?? "",
            type: row.project_type ?? "",
            country: row.host_country ?? "",
            role: row.role ?? "",
            permission: row.permission,
            memberType: row.member_type,
            source: row.source,
            companyId: row.company_id,
            companyName: row.company_name ?? "",
        }));
    }

    async getAccount(userId: string): Promise<AccountResponse> {
        const user = await this.getUserOrThrow(this.db, userId);
        const profile = await this.getProfileRow(this.db, userId);
        const affiliations = await this.listCompanyAffiliations(this.db, userId);
        const projects = await this.listProjectAffiliations(this.db, userId);

        return this.mapAccount(user, profile, affiliations, projects.length);
    }

    async getAccountCompanies(userId: string): Promise<AccountCompanyAffiliation[]> {
        await this.getUserOrThrow(this.db, userId);
        return this.listCompanyAffiliations(this.db, userId);
    }

    async getAccountProjects(userId: string): Promise<AccountProjectAffiliation[]> {
        await this.getUserOrThrow(this.db, userId);
        return this.listProjectAffiliations(this.db, userId);
    }

    async upsertAccount(userId: string, profile: AccountProfileInput): Promise<AccountResponse> {
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");

            const user = await this.getUserOrThrow(client, userId);

            await client.query(
                `
                INSERT INTO public.user_profiles (
                  user_id,
                  full_name,
                  headline,
                  job_title,
                  bio,
                  phone_number,
                  contact_email,
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
                  is_public,
                  show_phone,
                  show_contact_email,
                  updated_at
                )
                VALUES (
                  $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,  $10, $11,
                  $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW()
                )
                ON CONFLICT (user_id)
                DO UPDATE SET
                  full_name = EXCLUDED.full_name,
                  headline = EXCLUDED.headline,
                  job_title = EXCLUDED.job_title,
                  bio = EXCLUDED.bio,
                  phone_number = EXCLUDED.phone_number,
                  contact_email = EXCLUDED.contact_email,
                  country = EXCLUDED.country,
                  city = EXCLUDED.city,
                  timezone = EXCLUDED.timezone,
                  role_type = EXCLUDED.role_type,
                  expertise_tags = EXCLUDED.expertise_tags,
                  service_offerings = EXCLUDED.service_offerings,
                  sectors = EXCLUDED.sectors,
                  standards = EXCLUDED.standards,
                  languages = EXCLUDED.languages,
                  personal_website = EXCLUDED.personal_website,
                  linkedin_url = EXCLUDED.linkedin_url,
                  portfolio_url = EXCLUDED.portfolio_url,
                  is_public = EXCLUDED.is_public,
                  show_phone = EXCLUDED.show_phone,
                  show_contact_email = EXCLUDED.show_contact_email,
                  delete_flag = false,
                  updated_at = NOW()
                `,
                [
                    userId,
                    profile.fullName,
                    profile.headline,
                    profile.jobTitle,
                    profile.bio,
                    profile.phoneNumber,
                    profile.contactEmail,
                    profile.country,
                    profile.city,
                    profile.timezone,
                    profile.roleType,
                    profile.expertiseTags,
                    profile.serviceOfferings,
                    profile.sectors,
                    profile.standards,
                    profile.languages,
                    profile.personalWebsite,
                    profile.linkedinUrl,
                    profile.portfolioUrl,
                    profile.isPublic,
                    profile.showPhone,
                    profile.showContactEmail,
                ]
            );

            await client.query("COMMIT");

            const affiliations = await this.listCompanyAffiliations(this.db, userId);
            const projects = await this.listProjectAffiliations(this.db, userId);

            return this.mapAccount(user, await this.getProfileRow(this.db, userId), affiliations, projects.length);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getPublicProfile(userId: string): Promise<AccountResponse> {
        const { user, profile } = await this.assertPublicProfileAccessible(this.db, userId);
        const affiliations = await this.listCompanyAffiliations(this.db, userId);
        const projects = await this.listProjectAffiliations(this.db, userId);

        const mapped = this.mapAccount(user, profile, affiliations, projects.length);

        return {
            ...mapped,
            user: {
                ...mapped.user,
                email: "",
            },
            profile: {
                ...mapped.profile,
                phoneNumber: mapped.profile.showPhone ? mapped.profile.phoneNumber : "",
                contactEmail: mapped.profile.showContactEmail ? mapped.profile.contactEmail : "",
            },
        };
    }

    async getPublicProfileCompanies(userId: string): Promise<AccountCompanyAffiliation[]> {
        await this.assertPublicProfileAccessible(this.db, userId);
        return this.listCompanyAffiliations(this.db, userId);
    }

    async getPublicProfileProjects(userId: string): Promise<AccountProjectAffiliation[]> {
        await this.assertPublicProfileAccessible(this.db, userId);
        return this.listProjectAffiliations(this.db, userId);
    }

    async softDeleteAccount(userId: string): Promise<void> {
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");

            await client.query(
                `
                UPDATE public.user_profiles
                SET
                  delete_flag = true,
                  updated_at = NOW()
                WHERE user_id = $1
                  AND COALESCE(delete_flag, false) = false
                `,
                [userId]
            );

            await client.query(
                `
                UPDATE public.users_new
                SET
                  delete_flag = true,
                  updated_at = NOW()
                WHERE id = $1
                  AND COALESCE(delete_flag, false) = false
                `,
                [userId]
            );

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteAccount(userId: string): Promise<void> {
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");

            const userResult = await client.query<{ id: string }>(
                `
                SELECT id
                FROM public.users_new
                WHERE id = $1
                LIMIT 1
                `,
                [userId]
            );

            if (!userResult.rows[0]) {
                throw new Error("USER_NOT_FOUND");
            }

            await client.query(
                `
                DELETE FROM public.users_new
                WHERE id = $1
                `,
                [userId]
            );

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}