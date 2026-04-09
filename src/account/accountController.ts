import type { Request, Response, NextFunction } from "express";
import type { AccountService } from "./accountService.js";
import { updateAccountSchema } from "./schema.js";

type AuthenticatedRequest = Request & {
    user?: {
        id?: string;
        userId?: string;
        email?: string;
    };
    session?: {
        user?: {
            id?: string;
            userId?: string;
            email?: string;
        };
    };
};

function getAuthenticatedUserId(req: AuthenticatedRequest): string | null {
    return (
        req.user?.id ??
        req.user?.userId ??
        req.session?.user?.id ??
        req.session?.user?.userId ??
        null
    );
}

export class AccountController {
    constructor(private readonly accountService: AccountService) { }

    getAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const result = await this.accountService.getAccount(userId);
            return res.status(200).json(result);
        } catch (error) {
            if (error instanceof Error && error.message === "USER_NOT_FOUND") {
                return res.status(404).json({ message: "User not found" });
            }
            return next(error);
        }
    };

    getPublicProfile = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = String(req.params.id || "").trim();
            if (!userId) {
                return res.status(400).json({ message: "Invalid user id" });
            }

            const result = await this.accountService.getPublicProfile(userId);
            return res.status(200).json(result);
        } catch (error) {
            if (error instanceof Error && error.message === "USER_NOT_FOUND") {
                return res.status(404).json({ message: "User not found" });
            }

            if (error instanceof Error && error.message === "PROFILE_NOT_PUBLIC") {
                return res.status(404).json({ message: "User profile not found" });
            }

            return next(error);
        }
    };

    updateAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const parsed = updateAccountSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    message: "Invalid request body",
                    errors: parsed.error.flatten(),
                });
            }

            const result = await this.accountService.upsertAccount(userId, parsed.data.profile);
            return res.status(200).json(result);
        } catch (error) {
            if (error instanceof Error && error.message === "USER_NOT_FOUND") {
                return res.status(404).json({ message: "User not found" });
            }
            return next(error);
        }
    };

    deleteAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            await this.accountService.deleteAccount(userId);

            // if (req.session) {
            //     req.session.destroy(() => undefined);
            // }

            return res.status(204).send();
        } catch (error) {
            return next(error);
        }
    };

    getOwnCompanies = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const result = await this.accountService.getAccountCompanies(userId);
            return res.status(200).json({ items: result });
        } catch (error) {
            if (error instanceof Error && error.message === "USER_NOT_FOUND") {
                return res.status(404).json({ message: "User not found" });
            }
            return next(error);
        }
    };

    getOwnProjects = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const result = await this.accountService.getAccountProjects(userId);
            return res.status(200).json({ items: result });
        } catch (error) {
            if (error instanceof Error && error.message === "USER_NOT_FOUND") {
                return res.status(404).json({ message: "User not found" });
            }
            return next(error);
        }
    };

    getPublicCompanies = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = String(req.params.id || "").trim();
            if (!userId) {
                return res.status(400).json({ message: "Invalid user id" });
            }

            const result = await this.accountService.getPublicProfileCompanies(userId);
            return res.status(200).json({ items: result });
        } catch (error) {
            if (error instanceof Error && error.message === "USER_NOT_FOUND") {
                return res.status(404).json({ message: "User not found" });
            }

            if (error instanceof Error && error.message === "PROFILE_NOT_PUBLIC") {
                return res.status(404).json({ message: "User profile not found" });
            }

            return next(error);
        }
    };

    getPublicProjects = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = String(req.params.id || "").trim();
            if (!userId) {
                return res.status(400).json({ message: "Invalid user id" });
            }

            const result = await this.accountService.getPublicProfileProjects(userId);
            return res.status(200).json({ items: result });
        } catch (error) {
            if (error instanceof Error && error.message === "USER_NOT_FOUND") {
                return res.status(404).json({ message: "User not found" });
            }

            if (error instanceof Error && error.message === "PROFILE_NOT_PUBLIC") {
                return res.status(404).json({ message: "User profile not found" });
            }

            return next(error);
        }
    };
}