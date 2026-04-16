import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { buildAgentContext } from '@/lib/agents/db-context-builder'
import { requirePythonBackendUrl } from '@/lib/env'

export async function POST(request: NextRequest) {
  try {
    const PYTHON_BACKEND_URL = requirePythonBackendUrl()
    const body = await request.json()
    const { message, agent_id, session_id, cache, listing_id } = body

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: 'message is required',
          },
          error: 'message is required',
        },
        { status: 400 }
      )
    }

    // Get authenticated user
    const session = await getSession()

    if (!session?.userId) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: 'Unauthorized',
          },
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    let finalMessage = message;
    if (session.orgId) {
       try {
          const dbContext = await buildAgentContext(session.orgId, listing_id);
          finalMessage = `[SYSTEM CONTEXT - USE EXCLUSIVELY]\n${dbContext}\n\n[USER QUESTION]\n${message}`;
       } catch (err) {
          console.error("Failed to build DB context:", err);
       }
    }

    // Proxy to Python backend
    let pythonResponse: Response
    try {
      pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: finalMessage,
          agent_id: agent_id || 'cro',
          user_id: session.userId,
          session_id: session_id || `${agent_id || 'cro'}-${session.userId}`,
          cache: cache || null,
        }),
      })
    } catch (fetchErr) {
      // Connection refused or DNS failure — backend is not running
      const isConnRefused =
        fetchErr instanceof Error &&
        (fetchErr.message.includes('ECONNREFUSED') ||
          fetchErr.message.includes('fetch failed') ||
          fetchErr.message.includes('ENOTFOUND'))

      const userMessage = isConnRefused
        ? `The AI backend is currently offline (could not reach ${PYTHON_BACKEND_URL}). Please ensure the Python backend is running and try again.`
        : `Failed to reach the AI backend: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`

      return NextResponse.json(
        {
          success: false,
          response: { status: 'error', result: {}, message: userMessage },
          error: userMessage,
        },
        { status: 503 }
      )
    }

    const pythonData = await pythonResponse.json()

    if (!pythonResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: pythonData.detail || 'Python backend error',
          },
          error: pythonData.detail || 'Python backend error',
        },
        { status: pythonResponse.status }
      )
    }

    // Detect tool-loop error from Lyzr and replace with a clean user-facing message.
    // This happens when the agent has tools attached but should be using injected context.
    const rawMessage: string =
      pythonData?.response?.message ||
      pythonData?.message ||
      pythonData?.result?.chat_response ||
      ''
    const isToolLoopError =
      typeof rawMessage === 'string' &&
      (rawMessage.toLowerCase().includes('maximum number of tool calls') ||
        rawMessage.toLowerCase().includes("i've reached the maximum") ||
        rawMessage.toLowerCase().includes('reached the maximum number of tool calls'))

    if (isToolLoopError) {
      const retryMessage =
        "I hit a processing limit on that request. Could you rephrase or ask a simpler question? For example: \"What's my occupancy?\" or \"Show revenue by channel.\""
      if (pythonData?.response?.message) pythonData.response.message = retryMessage
      if (pythonData?.message) pythonData.message = retryMessage
      if (pythonData?.result?.chat_response) pythonData.result.chat_response = retryMessage
    }

    // Return Python backend response
    return NextResponse.json(pythonData)

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: errorMsg },
        error: errorMsg,
      },
      { status: 500 }
    )
  }
}
