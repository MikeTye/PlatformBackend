import type { Request, Response, NextFunction } from "express";
import type { UserService } from "./userService.js";
import { listUserOptionsQuerySchema } from "./schema.js";

export class UserController {
    constructor(private readonly userService: UserService) { }

    listUserOptions = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = listUserOptionsQuerySchema.safeParse(req.query);

            if (!parsed.success) {
                return res.status(400).json({
                    message: "Invalid query params",
                    errors: parsed.error.flatten(),
                });
            }

            const result = await this.userService.listUserOptions(parsed.data);

            return res.status(200).json({
                ok: true,
                ...result,
            });
        } catch (error) {
            return next(error);
        }
    };
}