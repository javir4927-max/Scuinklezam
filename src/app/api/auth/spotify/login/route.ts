import { NextResponse } from "next/server";

function getBaseUrl(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  if (host.includes("localhost") || host.includes("127.0.0.1") || !host) {
    return "http://127.0.0.1:3000";
  }
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const baseUrl = getBaseUrl(request);

  if (!clientId || clientId.trim() === "") {
    return NextResponse.redirect(`${baseUrl}/?spotify_setup=missing`);
  }

  // Save return_to path if provided, or from referer
  const returnTo = searchParams.get("return_to") || request.headers.get("referer") || "/play?spotify=connected";

  // Spotify Developer policy strictly mandates 127.0.0.1 for local redirect URIs
  const redirectUri = `${baseUrl}/api/auth/spotify/callback`;
  const scope = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-library-read",
    "user-library-modify",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-top-read",
    "user-read-recently-played",
  ].join(" ");

  const state = Math.random().toString(36).substring(7);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("spotify_return_to", returnTo, {
    path: "/",
    maxAge: 600,
    sameSite: "lax",
    httpOnly: true,
  });

  return response;
}
