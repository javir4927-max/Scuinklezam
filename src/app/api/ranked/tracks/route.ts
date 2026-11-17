import { NextResponse } from "next/server";
import { searchVerifiedTracks } from "@/lib/musicService";
import { RANKED_CATEGORIES } from "@/lib/rankedStore";
import { FALLBACK_SPOTIFY_TRACKS } from "@/lib/spotifyTypes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category") || "artist_bad_bunny";

  const cat = RANKED_CATEGORIES.find((c) => c.id === categoryId);
  const query = cat ? cat.query : categoryId;

  try {
    const tracks = await searchVerifiedTracks(query);
    if (tracks && tracks.length >= 4) {
      return NextResponse.json({ success: true, tracks });
    }
  } catch (err) {
    console.warn(`[ranked/tracks] searchVerifiedTracks failed for ${query}:`, err);
  }

  return NextResponse.json({ success: true, tracks: FALLBACK_SPOTIFY_TRACKS });
}
