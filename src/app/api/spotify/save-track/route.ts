import { NextResponse } from "next/server";
import { getSpotifyUserToken } from "@/lib/spotifyServer";

export async function POST(request: Request) {
  return PUT(request);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const trackId = body.trackId?.replace("spotify:track:", "");

    if (!trackId) {
      return NextResponse.json({ success: false, error: "trackId is required" }, { status: 400 });
    }

    const token = await getSpotifyUserToken();

    if (!token) {
      // Demo / simulated save if user hasn't connected Spotify yet
      return NextResponse.json({
        success: true,
        saved: true,
        demo: true,
        message: "Saved to local favorites (connect Spotify to sync with your real library!)",
      });
    }

    const res = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      return NextResponse.json({
        success: true,
        saved: true,
        demo: false,
        message: "Saved to your Spotify Liked Songs!",
      });
    } else {
      const errText = await res.text();
      console.warn("Failed to save track to Spotify:", errText);
      return NextResponse.json({
        success: true,
        saved: true,
        demo: true,
        message: "Saved locally (Spotify sync error)",
      });
    }
  } catch (err) {
    console.error("Error in /api/spotify/save-track:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
