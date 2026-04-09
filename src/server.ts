import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { pool } from "./db/connection.js";
import userRoutes from "./routes/user.js";
import companyRoutes from "./routes/company.js";
import projectRoutes from "./routes/project.js";
import companyClaimRoutes from "./routes/companyClaim.js";
import { AuthController } from "./auth/authController.js";
import { AuthService } from "./auth/authService.js";
import { mailer } from "./auth/mailer.js";
import { buildAuthRoutes } from "./auth/authRoutes.js";
import { authRepoPg } from "./auth/authRepoPg.js";
import { createOnboardingRoutes } from "./onboarding/onboardingRoutes.js";
import { attachCurrentUser } from "./middleware/attachCurrentUser.js";
import { createCompanyRoutes } from "./companies/companyRoutes.js";
import { createProjectRoutes } from "./projects/projectRoutes.js";
import { createSavedItemRoutes } from "./savedItems/savedItemRoutes.js";
import { buildAccountRouter } from "./account/accountRoutes.js";
import { buildUserRouter } from "./user/userRoutes.js";

import { attachRequestId } from "./middleware/requestContext.js";
import { ErrorLogRepo } from "./errorLogs/errorLogRepo.js";
import { ErrorLogService } from "./errorLogs/errorLogService.js";
import { createErrorLogRoutes } from "./errorLogs/errorLogRoutes.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { registerProcessErrorHandlers } from "./errorLogs/processErrorHandler.js";
import { buildShareLinkPublicRouter, buildShareLinkRouter } from "./shareLink/shareLinkRoutes.js";

const app = express();
const port = process.env.PORT || 3000;

const errorLogService = new ErrorLogService(new ErrorLogRepo(pool));
registerProcessErrorHandlers(errorLogService);

const authService = new AuthService(
    authRepoPg,
    mailer,
    process.env.OTP_SECRET!,
    process.env.SESSION_SECRET!,
    process.env.GOOGLE_CLIENT_ID!,
);

const authController = new AuthController(
    authService,
    process.env.SESSION_SECRET!
);

const allowlist = new Set([
    "http://localhost:5173",
    "http://localhost:3000",
    "https://preview.thecarboneconomy.org",
]);

const corsOptions: cors.CorsOptions = {
    origin: (origin, cb) => {
        console.log("CORS origin:", origin);
        if (!origin || allowlist.has(origin)) {
            return cb(null, true);
        }
        return cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "x-request-id"],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(attachRequestId);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(attachCurrentUser(authService, process.env.SESSION_SECRET!));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", buildAuthRoutes(authController));
app.use("/user-profiles", createOnboardingRoutes(pool));
app.use("/companies", createCompanyRoutes(pool));
app.use("/projects", createProjectRoutes(pool));
app.use("/saved-items", createSavedItemRoutes(pool));
app.use("/users", buildUserRouter(pool));
app.use("/account", buildAccountRouter(pool));
app.use("/error-logs", createErrorLogRoutes(pool));
// app.use("/companies", companyRoutes);
app.use("/companyClaims", companyClaimRoutes);
app.use("/share-links", buildShareLinkRouter(pool));
app.use("/auth/share-links", buildShareLinkPublicRouter(pool));

app.use(createErrorHandler(errorLogService));

app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});