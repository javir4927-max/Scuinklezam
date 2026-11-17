let cachedAppToken: string | null = null;
let appTokenExpiresAt: number = 0;

/**
 * Gets Spotify App-level token using Client Credentials Flow.
 * Caches in memory to avoid redundant requests.
 * Zero dependency on next/headers.
 */
export async function getSpotifyAppToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  // Check if existing token is valid (with 60-second buffer)
  if (cachedAppToken && Date.now() < appTokenExpiresAt - 60000) {
    return cachedAppToken;
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
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("Failed to get Spotify App Token:", await response.text());
      return null;
    }

    const data = await response.json();
    cachedAppToken = data.access_token;
    appTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedAppToken;
  } catch (error) {
    console.error("Error obtaining Spotify App Token:", error);
    return null;
  }
}
