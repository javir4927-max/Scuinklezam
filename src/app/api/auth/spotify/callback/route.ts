import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSpotifyRedirectUri, resolveSpotifyOrigin } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const cookieStore = cookies();

  // Resolve base origin (from login session cookie or fallback to request resolver)
  const origin =
    cookieStore.get("spotify_auth_origin")?.value ||
    resolveSpotifyOrigin(request);

  if (error || !code) {
    const errorUrl = `${origin}/?spotify_error=${encodeURIComponent(error || "no_code")}`;
    const errRes = NextResponse.redirect(errorUrl);
    errRes.cookies.delete("spotify_oauth_redirect_uri");
    errRes.cookies.delete("spotify_return_to");
    errRes.cookies.delete("spotify_auth_origin");
    return errRes;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?spotify_setup=missing`);
  }

  // Exact redirectUri synchronization: read from cookie (matching authorize call byte-for-byte)
  // with fallback to resolveSpotifyRedirectUri(request)
  const redirectUri =
    cookieStore.get("spotify_oauth_redirect_uri")?.value ||
    resolveSpotifyRedirectUri(request);

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Spotify Token Exchange Error]:", errText);
      const failRes = NextResponse.redirect(`${origin}/?spotify_error=exchange_failed`);
      failRes.cookies.delete("spotify_oauth_redirect_uri");
      failRes.cookies.delete("spotify_return_to");
      failRes.cookies.delete("spotify_auth_origin");
      return failRes;
    }

    const data = await response.json();

    // Determine target redirect url
    let returnTo = cookieStore.get("spotify_return_to")?.value;
    let targetUrl = `${origin}/play?spotify=connected`;

    if (returnTo) {
      if (returnTo.startsWith("/")) {
        const separator = returnTo.includes("?") ? "&" : "?";
        targetUrl = `${origin}${returnTo}${returnTo.includes("spotify=connected") ? "" : `${separator}spotify=connected`}`;
      } else if (returnTo.startsWith("http://") || returnTo.startsWith("https://")) {
        const separator = returnTo.includes("?") ? "&" : "?";
        targetUrl = `${returnTo}${returnTo.includes("spotify=connected") ? "" : `${separator}spotify=connected`}`;
      }
    }

    const res = NextResponse.redirect(targetUrl);

    // Set auth cookies (allow non-secure on 127.0.0.1 local HTTP development)
    const isSecure = process.env.NODE_ENV === "production" && !origin.includes("127.0.0.1");

    res.cookies.set("spotify_access_token", data.access_token, {
      httpOnly: true,
      secure: isSecure,
      path: "/",
      maxAge: data.expires_in || 3600,
      sameSite: "lax",
    });

    if (data.refresh_token) {
      res.cookies.set("spotify_refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: isSecure,
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: "lax",
      });
    }

    // Clean up temporary OAuth synchronization cookies
    res.cookies.delete("spotify_oauth_redirect_uri");
    res.cookies.delete("spotify_return_to");
    res.cookies.delete("spotify_auth_origin");

    return res;
  } catch (err) {
    console.error("[Spotify Callback Exception]:", err);
    return NextResponse.redirect(`${origin}/?spotify_error=internal_error`);
  }
}
