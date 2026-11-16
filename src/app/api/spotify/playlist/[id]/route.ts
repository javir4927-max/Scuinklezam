import { NextResponse } from "next/server";
import {
  getSpotifyUserToken,
  getSpotifyAppToken,
  enrichSpotifyTracks,
  FALLBACK_SPOTIFY_TRACKS,
} from "@/lib/spotifyServer";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const playlistId = params.id;
  const token = (await getSpotifyUserToken()) || (await getSpotifyAppToken());

  if (!token) {
    return NextResponse.json({
      success: true,
      playlistId,
      tracks: FALLBACK_SPOTIFY_TRACKS,
    });
  }

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=30`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: "Failed to fetch playlist",
        tracks: FALLBACK_SPOTIFY_TRACKS,
      });
    }

    const data = await res.json();
    const rawTracks = (data.items || []).map((item: any) => item.track).filter(Boolean);
    const enriched = await enrichSpotifyTracks(rawTracks);

    return NextResponse.json({
      success: true,
      playlistId,
      tracks: enriched.length > 0 ? enriched : FALLBACK_SPOTIFY_TRACKS,
    });
  } catch (err) {
    console.error("Error in /api/spotify/playlist/[id]:", err);
    return NextResponse.json({
      success: false,
      tracks: FALLBACK_SPOTIFY_TRACKS,
    });
  }
}
