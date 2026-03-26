import type { Pool, PoolClient } from "pg";
import type { AccountProfileInput } from "./schema.js";

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
    affiliations: Array<{
        id?: string;
        companyId: string | null;
        companyName: string;
        role: string;
        permission: "creator" | "viewer";
    }>;
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

export class AccountService {
    constructor(private readonly db: Pool) { }

    private mapAccount(user: UserRow, profile?: ProfileRow | null): AccountResponse {
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
            // handled later by company backend
            affiliations: [],
        };
    }

    async getAccount(userId: string): Promise<AccountResponse> {
        const userResult = await this.db.query<UserRow>(
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

        const profileResult = await this.db.query<ProfileRow>(
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

        return this.mapAccount(user, profileResult.rows[0] ?? null);
    }

    async upsertAccount(userId: string, profile: AccountProfileInput): Promise<AccountResponse> {
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");

            const userResult = await client.query<UserRow>(
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
          $1,  -- user_id
          $2,  -- full_name
          $3,  -- headline
          $4,  -- job_title
          $5,  -- bio
          $6,  -- phone_number
          $7,  -- contact_email
          $8,  -- country
          $9,  -- city
          $10, -- timezone
          $11, -- role_type
          $12, -- expertise_tags
          $13, -- service_offerings
          $14, -- sectors
          $15, -- standards
          $16, -- languages
          $17, -- personal_website
          $18, -- linkedin_url
          $19, -- portfolio_url
          $20, -- is_public
          $21, -- show_phone
          $22, -- show_contact_email
          NOW()
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
            return await this.getAccount(userId);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getPublicProfile(userId: string): Promise<AccountResponse> {
        const userResult = await this.db.query<UserRow>(
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

        const profileResult = await this.db.query<ProfileRow>(
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

        const profile = profileResult.rows[0] ?? null;

        if (profile && profile.is_public === false) {
            throw new Error("PROFILE_NOT_PUBLIC");
        }

        const mapped = this.mapAccount(user, profile);

        return {
            ...mapped,
            user: {
                ...mapped.user,
                // do not expose login email in public profile response
                email: "",
            },
            profile: {
                ...mapped.profile,
                phoneNumber: mapped.profile.showPhone ? mapped.profile.phoneNumber : "",
                contactEmail: mapped.profile.showContactEmail ? mapped.profile.contactEmail : "",
            },
        };
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

            // If your schema does not yet have ON DELETE CASCADE everywhere,
            // manually delete from dependent tables here first.
            // Example:
            // await client.query(`DELETE FROM public.sessions WHERE user_id = $1`, [userId]);
            // await client.query(`DELETE FROM public.user_profiles WHERE user_id = $1`, [userId]);
            // await client.query(`DELETE FROM public.user_media WHERE user_id = $1`, [userId]);
            // await client.query(`DELETE FROM public.company_users WHERE user_id = $1`, [userId]);
            // await client.query(`DELETE FROM public.project_users WHERE user_id = $1`, [userId]);

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