import type { Response, NextFunction, Request } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import { CreateCompanySchema, ListCompaniesQuerySchema } from "./schema.js";
import { CompanyService } from "./companyService.js";
import {
    uploadCompanyLogo,
    promoteOnboardingCompanyLogo,
} from "../lib/s3Media.js";
import { z } from "zod";
import {
    GetCompanyDetailParamsSchema,
    type UpdateCompanyDetailInput,
    CompanyInviteLinkParamsSchema,
} from "./schema.js";

function parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "string" || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function getFileExt(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed.includes(".")) return "bin";
    return trimmed.split(".").pop() || "bin";
}

const UpdateCompanyParamsSchema = z.object({
    companyId: z.string().uuid(),
});

const UpdateCompanySectionSchema = z.object({
    section: z.enum([
        "header",
        "about",
        "services",
        "serviceCategories",
        "geographicalCoverage",
        "team",
        "documents",
        "media",
        "projects",
        "projectTypes",
        "permissions",
        "privacy",
    ]),
    data: z.record(z.string(), z.any()).default({}),
});


function emptyUpdateCompanyDetailInput(): UpdateCompanyDetailInput {
    return {};
}

function toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.map(String).map((v) => v.trim()).filter(Boolean);
}

function mapSectionUpdateToCompanyInput(
    section: z.infer<typeof UpdateCompanySectionSchema>["section"],
    data: Record<string, unknown>
): UpdateCompanyDetailInput {
    switch (section) {
        case "header":
            return {
                legalName: typeof data.legalName === "string" ? data.legalName : undefined,
                displayName: typeof data.displayName === "string" ? data.displayName : undefined,
                description: typeof data.description === "string" ? data.description : undefined,
                website: typeof data.website === "string" ? data.website : undefined,
                country: typeof data.country === "string" ? data.country : undefined,
                countryCode: typeof data.countryCode === "string" ? data.countryCode : undefined,
                roles: toStringArray(data.roles),
            };

        case "about":
            return {
                fullDescription:
                    typeof data.fullDescription === "string" ? data.fullDescription : undefined,
            };

        case "serviceCategories":
            return {
                serviceCategories: toStringArray(data.serviceCategories),
            };

        case "projectTypes":
            return {
                projectTypes: toStringArray(data.projectTypes),
            };

        case "services":
            return {
                serviceTypes: toStringArray(data.serviceTypes),
                serviceCategories: toStringArray(data.serviceCategories),
                services: toStringArray(data.services),
                projectTypes: toStringArray(data.projectTypes),
            };

        case "geographicalCoverage":
            return {
                geographicalCoverage: toStringArray(data.geographicalCoverage),
                country: typeof data.country === "string" ? data.country : undefined,
                countryCode: typeof data.countryCode === "string" ? data.countryCode : undefined,
            };

        default:
            return emptyUpdateCompanyDetailInput();
    }
}

function hasMeaningfulCompanyUpdate(input: UpdateCompanyDetailInput): boolean {
    return (
        input.legalName !== undefined ||
        input.displayName !== undefined ||
        input.description !== undefined ||
        input.fullDescription !== undefined ||
        input.website !== undefined ||
        input.country !== undefined ||
        input.countryCode !== undefined ||
        input.privacy !== undefined ||
        input.roles !== undefined ||
        input.serviceTypes !== undefined ||
        input.serviceCategories !== undefined ||
        input.services !== undefined ||
        input.projectTypes !== undefined ||
        input.geographicalCoverage !== undefined
    );
}

export class CompanyController {
    constructor(private readonly companyService: CompanyService) { }

    listCompanies = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const query = ListCompaniesQuerySchema.parse(req.query);
            const userId = req.user?.userId ?? null;

            const result = await this.companyService.listCompanies(userId, query);

            return res.status(200).json({
                ok: true,
                data: result.items,
                items: result.items,
                page: result.page,
                pageSize: result.pageSize,
                total: result.total,
                sortField: result.sortField,
                sortDirection: result.sortDirection,
                counts: result.counts,
                filters: result.filters,
            });
        } catch (err) {
            return next(err);
        }
    };

    createCompany = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const rawInput = {
                ...req.body,
                country: req.body.country ?? req.body.primaryGeography,
                roles: parseJsonArray(req.body.roles),
                serviceCategories: parseJsonArray(req.body.serviceCategories),
                projectTypes: parseJsonArray(req.body.projectTypes),
                regions: parseJsonArray(req.body.regions),
            };

            const input = CreateCompanySchema.parse(rawInput);
            const company = await this.companyService.createCompany(userId, input);

            let logoUrl: string | null = null;

            if (req.file) {
                const uploaded = await uploadCompanyLogo({
                    companyId: company.id,
                    originalName: req.file.originalname,
                    contentType: req.file.mimetype,
                    body: req.file.buffer,
                });

                await this.companyService.saveCompanyLogo({
                    companyId: company.id,
                    assetUrl: uploaded.assetUrl,
                    contentType: req.file.mimetype,
                    s3Key: uploaded.key,
                    sha256: uploaded.sha256,
                    metadata: {
                        originalName: req.file.originalname,
                        size: req.file.size,
                        source: "direct-create",
                    },
                });

                logoUrl = uploaded.assetUrl;
            } else if (typeof req.body.onboardingLogoTempKey === "string" && req.body.onboardingLogoTempKey.trim()) {
                const promoted = await promoteOnboardingCompanyLogo({
                    tempKey: req.body.onboardingLogoTempKey.trim(),
                    companyId: company.id,
                    contentType:
                        typeof req.body.onboardingLogoContentType === "string"
                            ? req.body.onboardingLogoContentType
                            : null,
                });

                await this.companyService.saveCompanyLogo({
                    companyId: company.id,
                    assetUrl: promoted.assetUrl,
                    contentType:
                        typeof req.body.onboardingLogoContentType === "string"
                            ? req.body.onboardingLogoContentType
                            : null,
                    s3Key: promoted.key,
                    sha256:
                        typeof req.body.onboardingLogoSha256 === "string"
                            ? req.body.onboardingLogoSha256
                            : null,
                    metadata: {
                        originalName:
                            typeof req.body.onboardingLogoOriginalName === "string"
                                ? req.body.onboardingLogoOriginalName
                                : null,
                        source: "onboarding-temp-promote",
                    },
                });

                logoUrl = promoted.assetUrl;
            }

            return res.status(201).json({
                ok: true,
                id: company.id,
                logoUrl,
                data: {
                    id: company.id,
                    logoUrl,
                },
            });
        } catch (err) {
            return next(err);
        }
    };

    getCompanyDetail = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const { companyIdOrSlug } = GetCompanyDetailParamsSchema.parse(req.params);
            const userId = req.user?.userId ?? null;

            const company = await this.companyService.getCompanyDetail(
                companyIdOrSlug,
                userId
            );

            if (!company) {
                return res.status(404).json({ message: "Company not found" });
            }

            return res.json(company);
        } catch (err) {
            next(err);
        }
    };

    updateCompanyDetail = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId } = UpdateCompanyParamsSchema.parse(req.params);
            const { section, data } = UpdateCompanySectionSchema.parse(req.body);

            const sectionPrivacy =
                data &&
                    typeof data.sectionPrivacy === "object" &&
                    data.sectionPrivacy !== null
                    ? (data.sectionPrivacy as {
                        sectionKey?: unknown;
                        visibility?: unknown;
                    })
                    : null;

            const privacyInput =
                sectionPrivacy &&
                    typeof sectionPrivacy.sectionKey === "string" &&
                    typeof sectionPrivacy.visibility === "string"
                    ? {
                        sectionKey: sectionPrivacy.sectionKey,
                        visibility: sectionPrivacy.visibility,
                    }
                    : null;

            let company = null;

            if (section === "team") {
                if (data.action === "remove") {
                    const input: {
                        userId?: string;
                        email?: string;
                        name?: string;
                    } = {};

                    if (typeof data.userId === "string" && data.userId.trim()) {
                        input.userId = data.userId.trim();
                    }
                    if (typeof data.email === "string" && data.email.trim()) {
                        input.email = data.email.trim();
                    }
                    if (typeof data.name === "string" && data.name.trim()) {
                        input.name = data.name.trim();
                    }

                    if (!input.userId && !input.email) {
                        return res.status(400).json({
                            ok: false,
                            error: "Team member userId or email is required for removal",
                        });
                    }

                    company = await this.companyService.removeCompanyTeamMember(
                        companyId,
                        userId,
                        input
                    );
                } else {
                    const input: {
                        userId?: string;
                        email?: string;
                        name?: string;
                        role?: string;
                        previousUserId?: string;
                        previousEmail?: string;
                    } = {};

                    if (typeof data.userId === "string" && data.userId.trim()) {
                        input.userId = data.userId.trim();
                    }
                    if (typeof data.email === "string" && data.email.trim()) {
                        input.email = data.email.trim();
                    }
                    if (typeof data.name === "string" && data.name.trim()) {
                        input.name = data.name.trim();
                    }
                    if (typeof data.role === "string" && data.role.trim()) {
                        input.role = data.role.trim();
                    }
                    if (typeof data.previousUserId === "string" && data.previousUserId.trim()) {
                        input.previousUserId = data.previousUserId.trim();
                    }
                    if (typeof data.previousEmail === "string" && data.previousEmail.trim()) {
                        input.previousEmail = data.previousEmail.trim();
                    }

                    if (!input.userId && !input.email) {
                        return res.status(400).json({
                            ok: false,
                            error: "Team member userId or email is required",
                        });
                    }

                    company = await this.companyService.upsertCompanyTeamMember(
                        companyId,
                        userId,
                        input
                    );
                }
            } else if (section === "permissions") {
                company = await this.companyService.replaceCompanyPermissions(
                    companyId,
                    userId,
                    Array.isArray(data.permissions) ? data.permissions : [],
                    Boolean(data.inheritCompanyPermissionsToProjects)
                );
            } else {
                const input = mapSectionUpdateToCompanyInput(section, data);

                if (hasMeaningfulCompanyUpdate(input)) {
                    company = await this.companyService.updateCompanyDetail(
                        companyId,
                        userId,
                        input
                    );
                }
            }

            if (privacyInput) {
                company = await this.companyService.updateCompanySectionPrivacy(
                    companyId,
                    userId,
                    privacyInput
                );
            }

            if (!company) {
                return res.status(400).json({
                    ok: false,
                    error: "No valid updates supplied",
                });
            }

            return res.status(200).json({ ok: true, data: company });
        } catch (err) {
            return next(err);
        }
    };

    listOptions = async (_req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await this.companyService.listCompanyOptions();
            return res.status(200).json(result);
        } catch (error) {
            return next(error);
        }
    };

    getOrCreateInviteLink = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId } = CompanyInviteLinkParamsSchema.parse(req.params);

            const invite = await this.companyService.getOrCreateCompanyInviteLink(
                companyId,
                userId
            );

            return res.status(200).json({
                ok: true,
                data: invite,
            });
        } catch (err) {
            return next(err);
        }
    };

    deleteCompany = async (
        req: RequestWithUser & Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const { companyId } = UpdateCompanyParamsSchema.parse(req.params);

            const deleted = await this.companyService.deleteCompany(companyId, userId);

            if (!deleted) {
                return res.status(404).json({
                    ok: false,
                    error: "Company not found",
                });
            }

            return res.status(200).json({
                ok: true,
                message: "Company deleted",
            });
        } catch (err) {
            return next(err);
        }
    };
}