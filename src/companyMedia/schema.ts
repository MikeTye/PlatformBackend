import { z } from "zod";

export const CompanyMediaParamsSchema = z.object({
    companyId: z.string().uuid(),
});

export const CompanyMediaItemParamsSchema = z.object({
    companyId: z.string().uuid(),
    mediaId: z.string().uuid(),
});

export const CompanyMediaUploadUrlQuerySchema = z.object({
    fileName: z.string().trim().min(1),
    contentType: z.string().trim().min(1),
});

export const CreateCompanyMediaSchema = z.object({
    kind: z.string().trim().optional().default("gallery"),
    assetUrl: z.string().trim().min(1),
    contentType: z.string().trim().nullable().optional(),
    s3Key: z.string().trim().nullable().optional(),
    sha256: z.string().trim().nullable().optional(),
    caption: z.string().trim().nullable().optional(),
    isCover: z.boolean().optional().default(false),
    metadata: z.record(z.string(), z.any()).optional().default({}),
});

export const UpdateCompanyMediaSchema = z.object({
    caption: z.string().trim().nullable().optional(),
    isCover: z.boolean().optional(),
});

export type CompanyMediaParams = z.infer<typeof CompanyMediaParamsSchema>;
export type CompanyMediaItemParams = z.infer<typeof CompanyMediaItemParamsSchema>;
export type CompanyMediaUploadUrlQuery = z.infer<typeof CompanyMediaUploadUrlQuerySchema>;
export type CreateCompanyMediaInput = z.infer<typeof CreateCompanyMediaSchema>;
export type UpdateCompanyMediaInput = z.infer<typeof UpdateCompanyMediaSchema>;

export type CompanyMediaVariant = "thumbnail";