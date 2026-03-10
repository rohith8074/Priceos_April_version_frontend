import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development_replace_this_in_production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret_for_development_replace_this_in_production";

interface TokenPayload {
    userId: string;
    role: string;
}

/**
 * Sign an Access Token (short-lived, 15m)
 */
export function signAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

/**
 * Sign a Refresh Token (long-lived, 7d)
 */
export function signRefreshToken(userId: string): string {
    return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

/**
 * Verify an Access Token
 * Throws if invalid or expired.
 */
export function verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Verify a Refresh Token
 * Throws if invalid or expired.
 */
export function verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
}
