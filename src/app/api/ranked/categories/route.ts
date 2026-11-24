import { NextResponse } from "next/server";
import { RANKED_CATEGORIES, RANKED_TIERS } from "@/lib/rankedTypes";
import { redis } from "@/lib/roomStore";
import { toArtistSlug } from "@/lib/rankedStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET() {
  let countsMap: Record<string, string | number> | null = null;
  if (redis) {
    try {
      countsMap = await redis.hgetall<Record<string, string | number>>("scuinklezam:stats:category_plays");
    } catch (err) {
      console.warn("[categories] Redis hgetall error:", err);
    }
  }

  const categories = RANKED_CATEGORIES.map((c) => {
    let plays = Number(countsMap?.[c.id] || 0);
    if (c.kind === "artist") {
      const slug = toArtistSlug(c.query || c.name);
      const hyphenId = `artist_${slug}`;
      if (hyphenId !== c.id && countsMap?.[hyphenId]) {
        plays += Number(countsMap[hyphenId] || 0);
      }
    }
    return {
      ...c,
      playerCount: plays,
    };
  });

  return NextResponse.json(
    {
      success: true,
      categories,
      tiers: RANKED_TIERS,
    },
    { headers: NO_CACHE_HEADERS }
  );
}
