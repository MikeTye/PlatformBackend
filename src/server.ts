import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import companyRoutes from "./routes/company.js";
import projectRoutes from "./routes/project.js";

const app = express();
const port = process.env.PORT || 4000;

const allowlist = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://preview.thecarboneconomy.org" // your CloudFront domain
]);

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    console.log("CORS origin:", origin);
    if (!origin || allowlist.has(origin)) {
      return cb(null, true); // allow
    }
    return cb(null, false); // disallow (no CORS headers)
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: false, // since you removed credentials: 'include'
};

// CORS MUST be before routes
app.use(cors(corsOptions));

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/companies", companyRoutes);
app.use("/projects", projectRoutes);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});