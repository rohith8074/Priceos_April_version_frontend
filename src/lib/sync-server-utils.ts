/**
 * sync-server-utils.ts — FRONTEND STUB
 *
 * Hostaway conversation syncing has been moved to the FastAPI backend.
 * The frontend triggers syncs via /api/sync/* endpoints.
 */

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

/** Trigger a Hostaway conversation sync for a listing */
export async function syncHostawayConversations(
  listingId: string,
  sessionToken?: string
): Promise<{ success: boolean; synced?: number; message?: string }> {
  try {
    const res = await fetch(`${API}/sync/hostaway-conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ listingId }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[sync-server-utils] Backend error:", err);
      return { success: false, message: err };
    }
    return res.json();
  } catch (err) {
    console.error("[sync-server-utils] Network error:", err);
    return { success: false, message: String(err) };
  }
}

/** Trigger a full portfolio sync (all platforms) */
export async function triggerFullSync(
  orgId: string,
  sessionToken?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`${API}/sync/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ orgId }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, message: err };
    }
    return res.json();
  } catch (err) {
    return { success: false, message: String(err) };
  }
}
