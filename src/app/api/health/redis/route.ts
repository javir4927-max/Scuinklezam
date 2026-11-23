import { NextResponse } from "next/server";
import { redis } from "@/lib/roomStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
  };

  if (!redis) {
    return NextResponse.json(
      {
        configured: false,
        ok: false,
        latencyMs: null,
        error: "Redis client is not configured (UPSTASH_REDIS_REST_URL or KV_REST_API_URL missing)",
      },
      { status: 503, headers }
    );
  }

  const start = performance.now();
  try {
    const pong = await redis.ping();
    const latencyMs = Math.round(performance.now() - start);

    return NextResponse.json(
      {
        configured: true,
        ok: pong === "PONG" || pong === "OK" || Boolean(pong),
        latencyMs,
        response: pong,
      },
      { status: 200, headers }
    );
  } catch (error: any) {
    const latencyMs = Math.round(performance.now() - start);
    return NextResponse.json(
      {
        configured: true,
        ok: false,
        latencyMs,
        error: error?.message || "Redis ping failed",
      },
      { status: 500, headers }
    );
  }
}
