import { db, userSettings } from "@/lib/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { apiSuccess, apiError } from "@/lib/api/response";
import { loginSchema, formatZodErrors } from "@/lib/validators";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

export async function POST(req: Request) {
    // ── Rate Limiting (Auth tier) ──
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`auth-login:${ip}`, RATE_LIMITS.auth);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many login attempts. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await req.json();
        const validation = loginSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid input", 400, formatZodErrors(validation.error));
        }

        const { username, password } = validation.data;
        const cleanUsername = username.trim().toLowerCase();

        // ── 1. Find user ──
        console.log(`🔍 [Auth/Login] Searching for user: ${cleanUsername}`);
        let user = await db.query.userSettings.findFirst({
            where: eq(userSettings.userId, cleanUsername),
        });

        // ── 2. Handle legacy/hardcoded test users ──
        const testUsernames = ['rohith', 'ram@gmail.com'];
        if (!user && testUsernames.includes(cleanUsername)) {
            console.log(`🌱 [Auth/Login] Seeding test user: ${cleanUsername}`);
            try {
                const hashedPassword = await bcrypt.hash('Password@123', 10);
                const results = await db.insert(userSettings).values({
                    userId: cleanUsername,
                    fullName: cleanUsername.split('@')[0],
                    email: cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@example.com`,
                    passwordHash: hashedPassword,
                    role: 'admin',
                    isApproved: true,
                }).returning();
                user = results[0];
                console.log(`✅ [Auth/Login] User seeded: ${user?.id}`);
            } catch (seedErr: any) {
                console.error(`❌ [Auth/Login] Seeding failed: ${seedErr.message}`, seedErr);
                throw seedErr;
            }
        }

        if (!user || !user.passwordHash) {
            console.log(`❌ [Auth/Login] User not found or no password hash for: ${cleanUsername}`);
            return apiError("UNAUTHORIZED", "Invalid credentials", 401);
        }

        // ── 3. Verify Password ──
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            console.log(`❌ [Auth/Login] Password mismatch for: ${cleanUsername}`);
            return apiError("UNAUTHORIZED", "Invalid credentials", 401);
        }

        if (!user.isApproved) {
            return apiError("FORBIDDEN", "Account pending approval", 403);
        }

        // ── 4. Generate Tokens ──
        console.log(`🎫 [Auth/Login] Generating tokens for: ${user.userId}`);
        const accessToken = signAccessToken({ userId: user.userId, role: user.role });
        const refreshToken = signRefreshToken(user.userId);

        // ── 5. Save refresh token to DB ──
        await db.update(userSettings)
            .set({ refreshToken })
            .where(eq(userSettings.id, user.id));

        console.log(`🚀 [Auth/Login] Login successful for: ${user.userId}`);
        return apiSuccess({
            user: {
                username: user.userId,
                fullName: user.fullName,
                role: user.role,
                isApproved: user.isApproved,
            },
            tokens: {
                accessToken,
                refreshToken,
            }
        });

    } catch (e: any) {
        console.error("❌ [Auth/Login] Unexpected Error:", e.name, e.message);
        return apiError("INTERNAL_ERROR", `An unexpected error occurred: ${e.message}`, 500);
    }
}
