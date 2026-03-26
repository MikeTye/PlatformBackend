import { z } from "zod";

export const listUserOptionsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional(),
});

export type ListUserOptionsQuery = z.infer<typeof listUserOptionsQuerySchema>;