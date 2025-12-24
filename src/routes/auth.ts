import { Router } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { query } from "../db/connection.js";
import { signToken } from "../auth/jwt.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { error } from "console";

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

type UserRow = {
    id: string;
    email: string;
    password_hash: string | null;
    provider: string;
    google_sub: string | null;
    name: string | null;
    avatar_url: string | null;
};

// helper
async function findUserByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
    return rows[0] ?? null;
}

// POST /auth/register { email, password, name? }
router.post("/register", async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await query<UserRow>(
        `INSERT INTO users (email, password_hash, provider, name)
     VALUES ($1, $2, 'local', $3)
     RETURNING *`,
        [email.toLowerCase(), hash, name ?? null]
    );

    const user = rows[0];
    if (!user) throw error
    const token = signToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// POST /auth/login { email, password }
router.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await findUserByEmail(email.toLowerCase());
    if (!user || !user.password_hash) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// POST /auth/google { idToken }
// router.post("/google", async (req, res) => {
//     const { idToken } = req.body ?? {};
//     if (!idToken) return res.status(400).json({ error: "idToken required" });

//     try {
//         const ticket = await googleClient.verifyIdToken({
//             idToken,
//             audience: process.env.GOOGLE_CLIENT_ID,
//         });
//         const payload = ticket.getPayload();
//         if (!payload?.email || !payload.sub) {
//             return res.status(400).json({ error: "Invalid Google token" });
//         }

//         const email = payload.email.toLowerCase();
//         const googleSub = payload.sub;

//         let user = await findUserByEmail(email);

//         if (!user) {
//             const { rows } = await query<UserRow>(
//                 `INSERT INTO users (email, provider, google_sub, name, avatar_url)
//          VALUES ($1, 'google', $2, $3, $4)
//          RETURNING *`,
//                 [email, googleSub, payload.name ?? null, payload.picture ?? null]
//             );
//             user = rows[0] ?? null; // normalize undefined → null
//         } else if (user.provider === "local" && !user.google_sub) {
//             // link Google to existing local account
//             const { rows } = await query<UserRow>(
//                 `UPDATE users
//          SET google_sub = $2, provider = 'google'
//          WHERE id = $1
//          RETURNING *`,
//                 [user.id, googleSub]
//             );
//             user = rows[0] ?? null; // normalize undefined → null
//         }

//         if (!user) throw new Error("User creation failed");
//         const token = signToken({ id: user.id, email: user.email });
//         res.json({
//             token,
//             user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url },
//         });
//     } catch (e) {
//         console.error(e);
//         return res.status(401).json({ error: "Failed to verify Google token" });
//     }
// });

// GET /auth/me
router.get("/me", authMiddleware, async (req: AuthedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { rows } = await query<UserRow>("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const u = rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });

    res.json({
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatar_url,
        provider: u.provider,
    });
});

export default router;