import { NextResponse } from "next/server";
import { RANKED_CATEGORIES, RANKED_TIERS } from "@/lib/rankedTypes";
import { redis } from "@/lib/roomStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await Promise.all(
    RANKED_CATEGORIES.map(async (c) => {
      let plays = 0;
      if (redis) {
        try {
          const val = await redis.get<string | number>(`scuinklezam:stats:plays:${c.id}`);
          if (val) plays = Number(val);
        } catch {
          plays = 0;
        }
      }
      return {
        ...c,
        playerCount: plays,
      };
    })
  );

  return NextResponse.json({
    success: true,
    categories,
    tiers: RANKED_TIERS,
  });
}
