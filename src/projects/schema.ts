import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

const nullableTrimmedString = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
        if (value == null) return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    });

const CoordinatesSchema = z
    .object({
        lat: z.number().finite(),
        lng: z.number().finite(),
    })
    .nullable()
    .optional()
    .default(null);

const CobenefitItemSchema = z.object({
    key: nonEmptyTrimmedString,
    label: nonEmptyTrimmedString,
});

const csvStringArraySchema = z
    .union([z.string(), z.array(z.string()), z.undefined()])
    .transform((value) => {
        if (Array.isArray(value)) {
            return value.map((v) => v.trim()).filter(Boolean);
        }

        if (typeof value === "string") {
            return value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
        }

        return [];
    });

export const CreateProjectSchema = z.object({
    companyId: z.string().uuid().nullable().optional().default(null),
    name: nonEmptyTrimmedString,
    tagline: z.string().trim().optional().default(""),
    type: nonEmptyTrimmedString,
    stage: nonEmptyTrimmedString,
    visibility: nonEmptyTrimmedString,
    country: nonEmptyTrimmedString,
    state: nullableTrimmedString,
    coordinates: CoordinatesSchema,
    story: z.string().trim().optional().default(""),
    approach: z.string().trim().optional().default(""),
    cobenefitItems: z.array(CobenefitItemSchema).optional().default([]),
});

export const ListProjectsQuerySchema = z.object({
    scope: z.enum(["all", "my", "saved"]).optional().default("all"),
    q: nullableTrimmedString,
    stage: csvStringArraySchema,
    projectType: csvStringArraySchema,
    hostCountry: csvStringArraySchema,
    opportunity: csvStringArraySchema,
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z
        .enum(["name", "developer", "stage", "type", "country", "updated"])
        .optional()
        .default("updated"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type ListProjectsQueryInput = z.infer<typeof ListProjectsQuerySchema>;

export const ProjectDetailParamsSchema = z.object({
    id: z.string().uuid(),
});

export type ProjectDetailParamsInput = z.infer<typeof ProjectDetailParamsSchema>;