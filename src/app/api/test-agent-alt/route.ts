import { NextResponse } from 'next/server';
import { getAgentId, getLyzrConfig, requireLyzrBaseUrl } from '@/lib/env';

const NOT_FOUND = NextResponse.json({ error: "Not found" }, { status: 404 });

// Alternative endpoint: /v3/inference/{agent_id}/chat/completions

export async function GET() {
  if (process.env.NODE_ENV === "production") return NOT_FOUND;
  try {
    const { apiKey: LYZR_API_KEY } = getLyzrConfig();
    const CRO_AGENT_ID = getAgentId('LYZR_CRO_ROUTER_AGENT_ID', 'AGENT_ID') || '';
    const LYZR_API_URL = `${requireLyzrBaseUrl()}/inference/${CRO_AGENT_ID}/chat/completions`;
    if (!LYZR_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'LYZR_API_KEY not configured in environment',
      }, { status: 500 });
    }

    const testQuestion = "What should I price a 1-bedroom apartment in Dubai Marina for next weekend? It has sea view, pool, and gym.";

    console.log('🧪 Testing CRO Agent (Alternative Endpoint)...');
    console.log('Endpoint:', LYZR_API_URL);
    console.log('Question:', testQuestion);

    const response = await fetch(LYZR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: testQuestion
          }
        ],
        stream: false
      }),
    });

    const rawText = await response.text();
    console.log('Raw response:', rawText.substring(0, 500));

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Lyzr API returned ${response.status}`,
        raw: rawText,
        endpoint: 'alternative (/v3/inference/{agent_id}/chat/completions)',
      }, { status: response.status });
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawText);
    } catch (e) {
      parsedResponse = { raw: rawText };
    }

    console.log('✅ Agent responded successfully via alternative endpoint');

    return NextResponse.json({
      success: true,
      question: testQuestion,
      agent_id: CRO_AGENT_ID,
      endpoint: 'alternative (/v3/inference/{agent_id}/chat/completions)',
      response: parsedResponse,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: 'alternative',
    }, { status: 500 });
  }
}
