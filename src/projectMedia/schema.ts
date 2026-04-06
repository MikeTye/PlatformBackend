import { z } from "zod";

export const ProjectMediaProjectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const ProjectMediaParamsSchema = z.object({
  projectId: z.string().uuid(),
  mediaId: z.string().uuid(),
});

export const ProjectMediaUploadUrlQuerySchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
});

export const CreateProjectMediaBodySchema = z.object({
  kind: z.string().trim().optional().default("gallery"),
  assetUrl: z.string().trim().min(1),
  contentType: z.string().trim().nullable().optional(),
  s3Key: z.string().trim().nullable().optional(),
  sha256: z.string().trim().nullable().optional(),
  caption: z.string().trim().nullable().optional(),
  isCover: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

export const UpdateProjectMediaBodySchema = z.object({
  caption: z.string().trim().nullable().optional(),
  isCover: z.boolean().optional(),
}).strict();

export type ProjectMediaProjectParams = z.infer<typeof ProjectMediaProjectParamsSchema>;
export type ProjectMediaParams = z.infer<typeof ProjectMediaParamsSchema>;
export type ProjectMediaUploadUrlQuery = z.infer<typeof ProjectMediaUploadUrlQuerySchema>;
export type CreateProjectMediaBody = z.infer<typeof CreateProjectMediaBodySchema>;
export type UpdateProjectMediaBody = z.infer<typeof UpdateProjectMediaBodySchema>;