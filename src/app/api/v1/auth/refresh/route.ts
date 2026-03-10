import { db, userSettings } from "@/lib/db";
import { eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api/response";
import { refreshSchema, formatZodErrors } from "@/lib/validators";
import { signAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

export async function POST(req: Request) {
    // ── Rate Limiting (Auth tier) ──
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`auth-refresh:${ip}`, RATE_LIMITS.auth);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await req.json();
        const validation = refreshSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid input", 400, formatZodErrors(validation.error));
        }

        const { refreshToken } = validation.data;

        // ── 1. Verify token ──
        let payload;
        try {
            payload = verifyRefreshToken(refreshToken);
        } catch (e) {
            return apiError("UNAUTHORIZED", "Invalid or expired refresh token", 401);
        }

        const { userId } = payload;

        // ── 2. Check refresh token in database ──
        const user = await db.query.userSettings.findFirst({
            where: eq(userSettings.userId, userId),
        });

        if (!user || user.refreshToken !== refreshToken) {
            return apiError("UNAUTHORIZED", "Refresh token mismatch or user not found", 401);
        }

        // ── 3. Sign new access token ──
        const accessToken = signAccessToken({ userId: user.userId, role: user.role });

        return apiSuccess({ accessToken });

    } catch (e: any) {
        console.error("Refresh v1 Error:", e);
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
    }
}
