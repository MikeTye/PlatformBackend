import type { NextFunction, Response } from "express";
import type { RequestWithUser } from "../middleware/attachCurrentUser.js";
import {
    RemoveSavedItemParamsSchema,
    SaveItemSchema,
    ListSavedItemsQuerySchema,
} from "./schema.js";
import { SavedItemService } from "./savedItemService.js";

export class SavedItemController {
    constructor(private readonly savedItemService: SavedItemService) {}

    listSavedItems = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const query = ListSavedItemsQuerySchema.parse(req.query);
            const data = await this.savedItemService.listSavedItems(userId, query.entityType);

            return res.status(200).json({
                ok: true,
                data,
            });
        } catch (err) {
            return next(err);
        }
    };

    saveItem = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const input = SaveItemSchema.parse(req.body);
            const savedItem = await this.savedItemService.saveItem(userId, input);

            return res.status(201).json({
                ok: true,
                data: {
                    id: savedItem.id,
                    entityType: savedItem.entity_type,
                    entityId: savedItem.entity_id,
                    createdAt: savedItem.created_at,
                },
            });
        } catch (err) {
            return next(err);
        }
    };

    removeSavedItem = async (
        req: RequestWithUser,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ ok: false, error: "Unauthorized" });
            }

            const params = RemoveSavedItemParamsSchema.parse(req.params);
            await this.savedItemService.removeSavedItem(
                userId,
                params.entityType,
                params.entityId
            );

            return res.status(200).json({
                ok: true,
            });
        } catch (err) {
            return next(err);
        }
    };
}