import { NextResponse } from "next/server";
import { resolveSpotifyRedirectUri, resolveSpotifyOrigin } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host ||
    "";
  const hostname = host.split(":")[0].toLowerCase();

  // 1. If user entered via localhost, redirect first to 127.0.0.1:3000
  // to ensure session cookies match the callback domain authorized in Spotify
  if (hostname === "localhost") {
    const port = host.split(":")[1] || "3000";
    const redirectUrl = new URL(request.url);
    redirectUrl.hostname = "127.0.0.1";
    redirectUrl.port = port;
    return NextResponse.redirect(redirectUrl.toString(), 307);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const origin = resolveSpotifyOrigin(request);

  if (!clientId || clientId.trim() === "") {
    return NextResponse.redirect(`${origin}/?spotify_setup=missing`);
  }

  // 2. Canonical redirect URI guaranteed to match Spotify Dashboard
  const redirectUri = resolveSpotifyRedirectUri(request);

  // Save return_to path if provided, or from referer
  const returnTo =
    url.searchParams.get("return_to") ||
    request.headers.get("referer") ||
    "/play?spotify=connected";

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

  // 3. Save redirect_uri in HTTP-only temporary cookie for byte-for-byte token exchange sync
  response.cookies.set("spotify_oauth_redirect_uri", redirectUri, {
    path: "/",
    maxAge: 600,
    sameSite: "lax",
    httpOnly: true,
  });

  response.cookies.set("spotify_return_to", returnTo, {
    path: "/",
    maxAge: 600,
    sameSite: "lax",
    httpOnly: true,
  });

  response.cookies.set("spotify_auth_origin", origin, {
    path: "/",
    maxAge: 600,
    sameSite: "lax",
    httpOnly: true,
  });

  return response;
}
