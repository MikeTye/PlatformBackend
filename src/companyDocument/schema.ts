import { z } from "zod";

export const CompanyDocumentParamsSchema = z.object({
    companyId: z.string().uuid(),
});

export const CompanyDocumentItemParamsSchema = z.object({
    companyId: z.string().uuid(),
    documentId: z.string().uuid(),
});

export const CompanyDocumentUploadUrlQuerySchema = z.object({
    fileName: z.string().trim().min(1),
    contentType: z.string().trim().min(1),
});

export const CreateCompanyDocumentSchema = z.object({
    kind: z.string().trim().optional().default("general"),
    assetUrl: z.string().trim().min(1),
    contentType: z.string().trim().nullable().optional(),
    s3Key: z.string().trim().nullable().optional(),
    sha256: z.string().trim().nullable().optional(),
    name: z.string().trim().nullable().optional(),
    type: z.string().trim().nullable().optional(),
    metadata: z.record(z.string(), z.any()).optional().default({}),
});

export const UpdateCompanyDocumentSchema = z.object({
    name: z.string().trim().nullable().optional(),
    type: z.string().trim().nullable().optional(),
});

export type CompanyDocumentParams = z.infer<typeof CompanyDocumentParamsSchema>;
export type CompanyDocumentItemParams = z.infer<typeof CompanyDocumentItemParamsSchema>;
export type CompanyDocumentUploadUrlQuery = z.infer<typeof CompanyDocumentUploadUrlQuerySchema>;
export type CreateCompanyDocumentInput = z.infer<typeof CreateCompanyDocumentSchema>;
export type UpdateCompanyDocumentInput = z.infer<typeof UpdateCompanyDocumentSchema>;