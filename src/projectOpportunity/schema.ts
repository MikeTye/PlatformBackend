import { z } from "zod";

export const ProjectOpportunityParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const ProjectOpportunityItemParamsSchema = z.object({
  opportunityId: z.string().uuid(),
});

export const ListProjectOpportunitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const CreateProjectOpportunityBodySchema = z.object({
  type: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  urgent: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
}).strict();

export const UpdateProjectOpportunityBodySchema = z.object({
  projectId: z.string().uuid().optional(),
  type: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  urgent: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

export type ProjectOpportunityParams = z.infer<typeof ProjectOpportunityParamsSchema>;
export type ProjectOpportunityItemParams = z.infer<typeof ProjectOpportunityItemParamsSchema>;
export type ListProjectOpportunitiesQuery = z.infer<typeof ListProjectOpportunitiesQuerySchema>;
export type CreateProjectOpportunityBody = z.infer<typeof CreateProjectOpportunityBodySchema>;
export type UpdateProjectOpportunityBody = z.infer<typeof UpdateProjectOpportunityBodySchema>;