import { NextResponse } from "next/server";
import { getAgentId, getLyzrConfig, requireLyzrChatUrl } from "@/lib/env";

/**
 * POST /api/hostaway/suggest-reply
 *
 * Generates a human-like, friendly reply from the property manager
 * using the full conversation thread + property details as context.
 *
 * Body:
 *  {
 *    messages: { sender: 'guest'|'admin', text: string, time: string }[],
 *    guestName: string,
 *    propertyName: string,
 *    propertyInfo?: {
 *      area?: string,
 *      bedrooms?: number,
 *      bathrooms?: number,
 *      capacity?: number,
 *      priceFloor?: number,
 *      priceCeiling?: number,
 *      checkInTime?: string,
 *      checkOutTime?: string,
 *      amenities?: string[],
 *    }
 *  }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { messages = [], guestName, propertyName, propertyInfo = {} } = body;

        // Derive the last guest message from the conversation thread
        const conversationMessages: { sender: string; text: string; time?: string }[] = Array.isArray(messages) ? messages : [];
        const lastGuestMessage = [...conversationMessages].reverse().find((m) => m.sender === "guest")?.text || "";

        if (!lastGuestMessage && conversationMessages.length === 0) {
            return NextResponse.json({ error: "No conversation provided" }, { status: 400 });
        }

        const lyzrAgentId = getAgentId("LYZR_CHAT_RESPONSE_AGENT_ID", "LYZR_Chat_Response_Agent_ID");
        const { apiKey: lyzrApiKey } = getLyzrConfig();
        const lyzrApiUrl = requireLyzrChatUrl();

        // Build conversation transcript for the prompt
        const transcript = conversationMessages
            .map((m) => `${m.sender === "guest" ? `Guest (${guestName || "Guest"})` : "Property Manager"}: ${m.text}`)
            .join("\n");

        // Build property context block
        const propertyLines: string[] = [];
        if (propertyName) propertyLines.push(`- Property name: ${propertyName}`);
        if (propertyInfo.area) propertyLines.push(`- Location/Area: ${propertyInfo.area}`);
        if (propertyInfo.bedrooms) propertyLines.push(`- Bedrooms: ${propertyInfo.bedrooms}`);
        if (propertyInfo.bathrooms) propertyLines.push(`- Bathrooms: ${propertyInfo.bathrooms}`);
        if (propertyInfo.capacity) propertyLines.push(`- Max guests: ${propertyInfo.capacity}`);
        if (propertyInfo.checkInTime) propertyLines.push(`- Check-in: ${propertyInfo.checkInTime}`);
        if (propertyInfo.checkOutTime) propertyLines.push(`- Check-out: ${propertyInfo.checkOutTime}`);
        if (propertyInfo.amenities?.length) propertyLines.push(`- Amenities: ${propertyInfo.amenities.join(", ")}`);
        const propertyContext = propertyLines.length > 0
            ? `\nPROPERTY INFORMATION:\n${propertyLines.join("\n")}`
            : `\nPROPERTY: ${propertyName || "Our Property"}`;

        // Keep the runtime prompt minimal: only property context + raw conversation.
        // Behavior/style instructions should live in the configured agent, not be rebuilt dynamically here.
        const prompt = `${propertyContext}

FULL CONVERSATION HISTORY:
${transcript || `Guest (${guestName || "Guest"}): ${lastGuestMessage}`}`;

        if (!lyzrAgentId || !lyzrApiKey) {
            console.warn("⚠️  [Reply] Lyzr not configured, returning friendly fallback");
            return NextResponse.json({
                success: true,
                reply: `Hey ${guestName || "there"}! Thanks so much for reaching out about ${propertyName || "the property"}. I'd love to help — let me check on that for you and get back to you shortly. In the meantime, feel free to ask anything else!`,
                source: "fallback",
            });
        }

        console.log(`📨 [Reply] Calling Lyzr agent ${lyzrAgentId} with ${conversationMessages.length} messages of context...`);

        const agentRes = await fetch(lyzrApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": lyzrApiKey,
            },
            body: JSON.stringify({
                user_id: "priceos-system",
                agent_id: lyzrAgentId,
                session_id: `reply-${Date.now()}`,
                message: prompt,
            }),
        });

        const agentJson = await agentRes.json();

        if (agentRes.ok && agentJson.response) {
            const rawResponse =
                typeof agentJson.response === "string"
                    ? agentJson.response
                    : agentJson.response?.message || agentJson.response?.data || "";

            // Strip JSON wrapper if the agent returned structured JSON
            let reply = rawResponse;
            try {
                const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.reply) reply = parsed.reply;
                }
            } catch {
                // Plain text — use as-is
            }

            // Strip markdown code fences
            reply = reply.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

            const lowerReply = reply.toLowerCase();
            const looksLikeAgentError =
                lowerReply.includes("maximum number of tool calls") ||
                lowerReply.includes("reached the maximum number of tool calls") ||
                lowerReply.includes("let me know if you need further assistance") ||
                lowerReply.includes("i've reached the maximum") ||
                lowerReply.includes("tool calls allowed");

            if (!reply || looksLikeAgentError) {
                return NextResponse.json({
                    success: true,
                    reply: `Hi ${guestName || "there"}, thanks for your message. I’m checking this for you now and will confirm shortly. Let me know if there’s anything else you’d like help with in the meantime!`,
                    source: "fallback",
                });
            }

            console.log(`✅ [Reply] Lyzr agent returned reply (${reply.length} chars)`);
            return NextResponse.json({ success: true, reply, source: "lyzr" });
        }

        // Fallback
        return NextResponse.json({
            success: true,
            reply: `Hey ${guestName || "there"}! Thanks for your message. I'm looking into this right now and will get back to you as soon as possible. Feel free to reach out if you need anything else!`,
            source: "fallback",
        });
    } catch (error) {
        console.error("❌ [Reply] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate reply" },
            { status: 500 }
        );
    }
}
