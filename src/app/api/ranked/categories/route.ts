import { NextResponse } from "next/server";
import { RANKED_CATEGORIES, RANKED_TIERS } from "@/lib/rankedTypes";
import { redis } from "@/lib/roomStore";
import { toArtistSlug } from "@/lib/rankedStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await Promise.all(
    RANKED_CATEGORIES.map(async (c) => {
      let plays = 0;
      if (redis) {
        try {
          const underscoreVal = await redis.get<string | number>(`scuinklezam:stats:plays:${c.id}`);
          const underscorePlays = Number(underscoreVal || 0);
          plays = underscorePlays;

          if (c.kind === "artist") {
            const slug = toArtistSlug(c.query || c.name);
            const hyphenId = `artist_${slug}`;
            if (hyphenId !== c.id) {
              const hyphenVal = await redis.get<string | number>(`scuinklezam:stats:plays:${hyphenId}`);
              const hyphenPlays = Number(hyphenVal || 0);
              plays = underscorePlays + hyphenPlays;
            }

            try {
              const artistPlayers = Number((await redis.zcard(`scuinklezam:ranked:artist:${slug}`)) || 0);
              plays = Math.max(plays, artistPlayers);
            } catch {
              // Ignore zcard errors if any
            }
          }
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
