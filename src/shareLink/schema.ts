import { z } from "zod";

export const ShareEntityTypeSchema = z.enum(["company", "project"]);

export const CreateShareLinkSchema = z.object({
    entityType: ShareEntityTypeSchema,
    entityId: z.string().uuid(),
});

export const ShareLinkPreviewQuerySchema = z.object({
    token: z.string().min(1, "token is required"),
});

export const ShareLinkConsumeSchema = z.object({
    token: z.string().min(1, "token is required"),
});

export type ShareEntityType = z.infer<typeof ShareEntityTypeSchema>;
export type CreateShareLinkInput = z.infer<typeof CreateShareLinkSchema>;
export type ShareLinkPreviewQuery = z.infer<typeof ShareLinkPreviewQuerySchema>;
export type ShareLinkConsumeInput = z.infer<typeof ShareLinkConsumeSchema>;

export type ShareLinkResponse = {
    shareLinkId: string;
    entityType: ShareEntityType;
    entityId: string;
    token: string;
    isActive: boolean;
    redirectTo: string;
    externalShareUrl: string;
    title: string | null;
    entitySlug: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ShareLinkPreviewResponse = {
    ok: true;
    share: {
        token: string;
        redirectTo: string;
        entityType: ShareEntityType;
        entityId: string;
        entitySlug: string | null;
        title: string | null;
    };
};

export type ShareLinkEventType =
    | "link_created"
    | "link_opened"
    | "signup_started"
    | "signup_completed"
    | "login_started"
    | "login_completed";