import { NextResponse } from "next/server";
import { fetchSpotifyUserAPI, enrichSpotifyTracks } from "@/lib/spotifyServer";

export const dynamic = "force-dynamic";

// Bypass local Windows certificate verification issues for external music APIs
if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "top_tracks"; // "top_tracks" | "recently_played" | "top_artists"
    const range = searchParams.get("range") || "long_term"; // "long_term" | "medium_term" | "short_term"

    if (tab === "top_tracks") {
      const validRange = ["long_term", "medium_term", "short_term"].includes(range)
        ? range
        : "long_term";

      const { res } = await fetchSpotifyUserAPI(
        `/v1/me/top/tracks?limit=50&time_range=${validRange}`
      );

      if (!res || !res.ok) {
        return NextResponse.json(
          { success: false, items: [], error: "No se pudieron obtener las canciones más escuchadas." },
          { headers: NO_CACHE_HEADERS }
        );
      }

      const data = await res.json();
      const rawTracks = data.items || [];

      // Enrich with iTunes Search API to resolve audio previews and original HD art while strictly preserving rank order #1 - #50
      const enriched = await enrichSpotifyTracks(rawTracks);

      return NextResponse.json(
        {
          success: true,
          tab,
          range: validRange,
          count: enriched.length,
          items: enriched,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (tab === "recently_played") {
      const { res } = await fetchSpotifyUserAPI(`/v1/me/player/recently-played?limit=50`);

      if (!res || !res.ok) {
        return NextResponse.json(
          { success: false, items: [], error: "No se pudieron obtener las canciones escuchadas recientemente." },
          { headers: NO_CACHE_HEADERS }
        );
      }

      const data = await res.json();
      const rawItems = (data.items || []).map((i: any) => i.track).filter(Boolean);

      // Enrich while preserving chronological order (#1 most recent)
      const enriched = await enrichSpotifyTracks(rawItems);

      return NextResponse.json(
        {
          success: true,
          tab,
          count: enriched.length,
          items: enriched,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (tab === "top_artists") {
      const validRange = ["long_term", "medium_term", "short_term"].includes(range)
        ? range
        : "medium_term";

      const { res } = await fetchSpotifyUserAPI(
        `/v1/me/top/artists?limit=50&time_range=${validRange}`
      );

      if (!res || !res.ok) {
        return NextResponse.json(
          { success: false, items: [], error: "No se pudieron obtener tus artistas más escuchados." },
          { headers: NO_CACHE_HEADERS }
        );
      }

      const data = await res.json();
      const items = (data.items || []).map((a: any, idx: number) => ({
        id: a.id,
        rank: idx + 1,
        name: a.name,
        genres: a.genres || [],
        imageUrl: a.images?.[0]?.url || a.images?.[1]?.url || a.images?.[2]?.url || "",
        spotifyUrl: a.external_urls?.spotify || `https://open.spotify.com/artist/${a.id}`,
      }));

      return NextResponse.json(
        {
          success: true,
          tab,
          range: validRange,
          count: items.length,
          items,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: "Pestaña no válida." },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("[/api/spotify/stats] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al obtener estadísticas de Spotify" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
