import { z } from "zod";

export const SavedEntityTypeSchema = z.enum(["project", "company", "opportunity"]);

export const SaveItemSchema = z.object({
    entityType: SavedEntityTypeSchema,
    entityId: z.string().uuid(),
});

export const RemoveSavedItemParamsSchema = z.object({
    entityType: SavedEntityTypeSchema,
    entityId: z.string().uuid(),
});

export const ListSavedItemsQuerySchema = z.object({
    entityType: z.enum(["all", "project", "company", "opportunity"]).optional().default("all"),
});

export type SaveItemInput = z.infer<typeof SaveItemSchema>;
export type RemoveSavedItemParamsInput = z.infer<typeof RemoveSavedItemParamsSchema>;
export type SavedEntityType = z.infer<typeof SavedEntityTypeSchema>;
export type ListSavedItemsQueryInput = z.infer<typeof ListSavedItemsQuerySchema>;