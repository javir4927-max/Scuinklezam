import { NextResponse } from "next/server";
import { getSpotifyAppToken } from "@/lib/spotifyServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, artists: [] });
  }

  try {
    const token = await getSpotifyAppToken();
    if (token) {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=6`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (res.ok) {
        const data = await res.json();
        const artists = (data.artists?.items || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          imageUrl: a.images?.[0]?.url || a.images?.[1]?.url || a.images?.[2]?.url || "",
          genres: (a.genres || []).slice(0, 2),
          followers: a.followers?.total || 0,
        }));

        if (artists.length > 0) {
          return NextResponse.json({ success: true, artists });
        }
      }
    }

    // Fallback to iTunes API if Spotify token is not available or fails
    const itunesRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=6`,
      { cache: "no-store" }
    );

    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      const seen = new Set<string>();
      const artists = (itunesData.results || [])
        .filter((r: any) => {
          if (!r.artistName || seen.has(r.artistName.toLowerCase())) return false;
          seen.add(r.artistName.toLowerCase());
          return true;
        })
        .map((r: any) => ({
          id: String(r.artistId || r.amgArtistId || Math.random()),
          name: r.artistName,
          imageUrl: "",
          genres: r.primaryGenreName ? [r.primaryGenreName] : [],
          followers: 0,
        }));

      return NextResponse.json({ success: true, artists });
    }

    return NextResponse.json({ success: true, artists: [] });
  } catch (err: any) {
    console.error("Error searching artists:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al buscar artistas", artists: [] },
      { status: 500 }
    );
  }
}
