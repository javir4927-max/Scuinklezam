/**
 * Single source of truth for resolving Spotify OAuth Redirect URIs and Origins.
 * Prevents 'INVALID_CLIENT: Not matching configuration' and 'redirect_uri_mismatch'
 * across localhost, Vercel preview/production, and custom tunnels (e.g. cloudflared).
 */

export function resolveSpotifyRedirectUri(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const cleanHost = host.toLowerCase().trim();

  // 1. Local environment (localhost or 127.0.0.1) -> Exactly 127.0.0.1:3000
  if (cleanHost.includes("localhost") || cleanHost.includes("127.0.0.1") || !cleanHost) {
    return "http://127.0.0.1:3000/api/auth/spotify/callback";
  }

  // 2. Vercel deployments (production or preview branches like *.vercel.app)
  // Strictly the canonical authorized domain configured in Spotify Developers Dashboard
  if (cleanHost.endsWith(".vercel.app")) {
    return "https://scuinklezam-zz38.vercel.app/api/auth/spotify/callback";
  }

  // 3. Any other domain (such as .trycloudflare.com or custom domains)
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}/api/auth/spotify/callback`;
}

/**
 * Resolves the canonical origin to redirect the user back to after OAuth login.
 */
export function resolveSpotifyOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const cleanHost = host.toLowerCase().trim();

  if (cleanHost.includes("localhost") || cleanHost.includes("127.0.0.1") || !cleanHost) {
    return "http://127.0.0.1:3000";
  }

  if (cleanHost.endsWith(".vercel.app")) {
    return "https://scuinklezam-zz38.vercel.app";
  }

  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}
