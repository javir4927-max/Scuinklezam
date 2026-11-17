/**
 * Single source of truth for resolving Spotify OAuth Redirect URIs and Origins.
 * Prevents 'INVALID_CLIENT: Not matching configuration' and 'redirect_uri_mismatch'
 * across localhost, fixed ngrok tunnel, Vercel preview/production, and custom domains.
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

  // 2. Fixed ngrok host domain
  if (cleanHost.includes("echo-both-mullets.ngrok-free.dev")) {
    return "https://echo-both-mullets.ngrok-free.dev/api/auth/spotify/callback";
  }

  // 3. Vercel deployments (production or preview branches like *.vercel.app)
  // Strictly the canonical authorized domain configured in Spotify Developers Dashboard
  if (cleanHost.endsWith(".vercel.app") || cleanHost.includes("scuinklezam")) {
    return "https://scuinklezam.vercel.app/api/auth/spotify/callback";
  }

  // 4. Any other domain (such as custom tunnels or domains)
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

  if (cleanHost.includes("echo-both-mullets.ngrok-free.dev")) {
    return "https://echo-both-mullets.ngrok-free.dev";
  }

  if (cleanHost.endsWith(".vercel.app") || cleanHost.includes("scuinklezam")) {
    return "https://scuinklezam.vercel.app";
  }

  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}
