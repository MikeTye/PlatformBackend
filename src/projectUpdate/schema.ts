import { z } from "zod";

export const ProjectUpdateParamsSchema = z.object({
    projectId: z.string().uuid(),
});

export const ProjectUpdateItemParamsSchema = z.object({
    updateId: z.string().uuid(),
});

export const ListProjectUpdatesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const CreateProjectUpdateBodySchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().nullable().optional(),
    dateLabel: z.string().trim().nullable().optional(),
    authorName: z.string().trim().nullable().optional(),
    type: z.enum(["progress", "stage"]).optional().default("progress"),
}).strict();

export const UpdateProjectUpdateBodySchema = z.object({
    projectId: z.string().uuid().optional(),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    dateLabel: z.string().trim().nullable().optional(),
    authorName: z.string().trim().nullable().optional(),
    type: z.enum(["progress", "stage"]).optional(),
    isActive: z.boolean().optional(),
}).strict();

export type ProjectUpdateParams = z.infer<typeof ProjectUpdateParamsSchema>;
export type ProjectUpdateItemParams = z.infer<typeof ProjectUpdateItemParamsSchema>;
export type ListProjectUpdatesQuery = z.infer<typeof ListProjectUpdatesQuerySchema>;
export type CreateProjectUpdateBody = z.infer<typeof CreateProjectUpdateBodySchema>;
export type UpdateProjectUpdateBody = z.infer<typeof UpdateProjectUpdateBodySchema>;