/**
 * JWT helpers — frontend only.
 * Uses the Web Crypto API via `jose` (edge/browser safe, no Node jsonwebtoken).
 * Signing is handled by the FastAPI backend; this module only DECODES the JWT
 * stored in the httpOnly cookie to read claims client-side (read-only).
 */

export interface TokenPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  isApproved: boolean;
  onboardingStep: string;
}

/**
 * Decode a JWT without verifying the signature (signature verified server-side).
 * Safe to use in Server Components to read claims from the session cookie.
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    );
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * @deprecated Server-side only — use the FastAPI backend for token signing.
 * Kept as a shim so legacy call-sites compile without crashing.
 */
export function verifyAccessToken(token: string): TokenPayload {
  const payload = decodeToken(token);
  if (!payload) throw new Error("Invalid or expired token");
  return payload;
}
