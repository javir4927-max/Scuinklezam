import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const baseUrl = getBaseUrl(request);

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/?spotify_error=${encodeURIComponent(error || "no_code")}`);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = `${baseUrl}/api/auth/spotify/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/?spotify_setup=missing`);
  }

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
      console.error("Spotify token error:", errText);
      return NextResponse.redirect(`${baseUrl}/?spotify_error=exchange_failed`);
    }

    const data = await response.json();

    // Determine target redirect url
    const cookieStore = cookies();
    let returnTo = cookieStore.get("spotify_return_to")?.value;
    let targetUrl = `${baseUrl}/play?spotify=connected`;

    if (returnTo) {
      if (returnTo.startsWith("/")) {
        const separator = returnTo.includes("?") ? "&" : "?";
        targetUrl = `${baseUrl}${returnTo}${returnTo.includes("spotify=connected") ? "" : `${separator}spotify=connected`}`;
      } else if (returnTo.startsWith("http://") || returnTo.startsWith("https://")) {
        const separator = returnTo.includes("?") ? "&" : "?";
        targetUrl = `${returnTo}${returnTo.includes("spotify=connected") ? "" : `${separator}spotify=connected`}`;
      }
    }

    const res = NextResponse.redirect(targetUrl);

    // Set cookies (allow non-secure on 127.0.0.1 local HTTP development)
    const isSecure = process.env.NODE_ENV === "production" && !baseUrl.includes("127.0.0.1");

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

    // Clear return_to cookie
    res.cookies.delete("spotify_return_to");

    return res;
  } catch (err) {
    console.error("Spotify callback exception:", err);
    return NextResponse.redirect(`${baseUrl}/?spotify_error=internal_error`);
  }
}
