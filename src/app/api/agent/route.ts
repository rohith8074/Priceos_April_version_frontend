import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, agent_id, session_id, cache } = body

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

    // Proxy to Python backend
    let pythonResponse: Response
    try {
      pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
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
