import { NextResponse } from "next/server";
import { getSpotifyUserToken } from "@/lib/spotifyServer";
import { cookies } from "next/headers";

export async function GET() {
  const token = await getSpotifyUserToken();

  if (!token) {
    return NextResponse.json({
      connected: false,
      accessToken: null,
      isPremium: false,
      user: null,
    });
  }

  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({
        connected: false,
        accessToken: null,
        isPremium: false,
        user: null,
      });
    }

    const profile = await res.json();
    const isPremium = profile.product === "premium";

    return NextResponse.json({
      connected: true,
      accessToken: token,
      isPremium,
      user: {
        id: profile.id,
        displayName: profile.display_name || profile.id,
        email: profile.email,
        avatarUrl: profile.images?.[0]?.url || "",
        product: profile.product,
        spotifyUrl: profile.external_urls?.spotify,
      },
    });
  } catch (err) {
    console.error("Error fetching Spotify user in /api/auth/spotify/token:", err);
    return NextResponse.json({
      connected: false,
      accessToken: null,
      isPremium: false,
      user: null,
    });
  }
}

export async function DELETE() {
  const cookieStore = cookies();
  const res = NextResponse.json({ success: true, message: "Disconnected Spotify session" });
  res.cookies.delete("spotify_access_token");
  res.cookies.delete("spotify_refresh_token");
  return res;
}
