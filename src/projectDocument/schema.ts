import { z } from "zod";

export const ProjectDocumentProjectParamsSchema = z.object({
    projectId: z.string().uuid(),
});

export const ProjectDocumentParamsSchema = z.object({
    projectId: z.string().uuid(),
    documentId: z.string().uuid(),
});

export const ProjectDocumentUploadUrlQuerySchema = z.object({
    fileName: z.string().trim().min(1),
    contentType: z.string().trim().min(1),
});

export const CreateProjectDocumentBodySchema = z.object({
    kind: z.string().trim().optional().default("general"),
    assetUrl: z.string().trim().min(1),
    contentType: z.string().trim().nullable().optional(),
    s3Key: z.string().trim().nullable().optional(),
    sha256: z.string().trim().nullable().optional(),
    name: z.string().trim().nullable().optional(),
    type: z.string().trim().nullable().optional(),
    status: z.string().trim().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

export const UpdateProjectDocumentBodySchema = z.object({
    name: z.string().trim().nullable().optional(),
    kind: z.string().trim().nullable().optional(),
    status: z.string().trim().nullable().optional(),
}).strict();

export type ProjectDocumentProjectParams = z.infer<typeof ProjectDocumentProjectParamsSchema>;
export type ProjectDocumentParams = z.infer<typeof ProjectDocumentParamsSchema>;
export type ProjectDocumentUploadUrlQuery = z.infer<typeof ProjectDocumentUploadUrlQuerySchema>;
export type CreateProjectDocumentBody = z.infer<typeof CreateProjectDocumentBodySchema>;
export type UpdateProjectDocumentBody = z.infer<typeof UpdateProjectDocumentBodySchema>;