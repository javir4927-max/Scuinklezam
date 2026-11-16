import { NextResponse } from "next/server";
import {
  getSpotifyUserTokenDetails,
  enrichSpotifyTracks,
  FALLBACK_SPOTIFY_TRACKS,
} from "@/lib/spotifyServer";
import {
  SpotifyUserProfile,
  SpotifyArtistItem,
  SpotifyPlaylistItem,
} from "@/lib/spotifyTypes";

export const dynamic = "force-dynamic";

export async function GET() {
  const { token, refreshedToken, expiresIn } = await getSpotifyUserTokenDetails();

  if (!token) {
    return NextResponse.json({
      connected: false,
      user: null,
      stats: null,
      playlists: [],
    });
  }

  try {
    const headers = { Authorization: `Bearer ${token}` };

    // Parallel fetch across Spotify official endpoints
    const [
      profileRes,
      topTracksShortRes,
      topTracksMedRes,
      topArtistsRes,
      recentlyPlayedRes,
      playlistsRes,
    ] = await Promise.all([
      fetch("https://api.spotify.com/v1/me", { headers }),
      fetch("https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20", { headers }),
      fetch("https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=25", { headers }),
      fetch("https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=10", { headers }),
      fetch("https://api.spotify.com/v1/me/player/recently-played?limit=20", { headers }),
      fetch("https://api.spotify.com/v1/me/playlists?limit=20", { headers }),
    ]);

    // If profile request failed, token might be revoked or invalid
    if (!profileRes.ok) {
      return NextResponse.json({
        connected: false,
        user: null,
        stats: null,
        playlists: [],
      });
    }

    const profileData = await profileRes.json();
    const topTracksShortData = topTracksShortRes.ok ? await topTracksShortRes.json() : { items: [] };
    const topTracksMedData = topTracksMedRes.ok ? await topTracksMedRes.json() : { items: [] };
    const topArtistsData = topArtistsRes.ok ? await topArtistsRes.json() : { items: [] };
    const recentlyPlayedData = recentlyPlayedRes.ok ? await recentlyPlayedRes.json() : { items: [] };
    const playlistsData = playlistsRes.ok ? await playlistsRes.json() : { items: [] };

    // 1. User Profile
    const user: SpotifyUserProfile = {
      id: profileData.id,
      displayName: profileData.display_name || profileData.id,
      email: profileData.email,
      avatarUrl: profileData.images?.[0]?.url || "",
      imageUrl: profileData.images?.[0]?.url || "",
      product: profileData.product || "free",
      isPremium: profileData.product === "premium",
    };

    // 2. Top Artists
    const topArtists: SpotifyArtistItem[] = (topArtistsData.items || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      genres: a.genres || [],
      imageUrl: a.images?.[0]?.url || a.images?.[1]?.url || "",
      spotifyUrl: a.external_urls?.spotify || `https://open.spotify.com/artist/${a.id}`,
    }));

    // 3. User Playlists
    const playlists: SpotifyPlaylistItem[] = (playlistsData.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description || "",
      tracksCount: p.tracks?.total || 0,
      tracksTotal: p.tracks?.total || 0,
      imageUrl: p.images?.[0]?.url || "",
      uri: p.uri,
    }));

    // 4. Enrich tracks with audio preview resolution
    const [topTracksShort, topTracksMedium, recentlyPlayed] = await Promise.all([
      enrichSpotifyTracks(topTracksShortData.items || []),
      enrichSpotifyTracks(topTracksMedData.items || []),
      enrichSpotifyTracks((recentlyPlayedData.items || []).map((i: any) => i.track)),
    ]);

    const response = NextResponse.json({
      connected: true,
      user,
      stats: {
        topTracksShort: topTracksShort.length > 0 ? topTracksShort : FALLBACK_SPOTIFY_TRACKS.slice(0, 10),
        topTracksMedium: topTracksMedium.length > 0 ? topTracksMedium : FALLBACK_SPOTIFY_TRACKS.slice(0, 10),
        topArtists,
        recentlyPlayed: recentlyPlayed.length > 0 ? recentlyPlayed : FALLBACK_SPOTIFY_TRACKS.slice(0, 10),
      },
      playlists,
    });

    // Update refreshed access token in cookie if applicable
    if (refreshedToken) {
      response.cookies.set("spotify_access_token", refreshedToken, {
        path: "/",
        maxAge: expiresIn || 3600,
        sameSite: "lax",
        httpOnly: true,
      });
    }

    return response;
  } catch (err) {
    console.error("Error in /api/spotify/me:", err);
    return NextResponse.json({
      connected: false,
      user: null,
      stats: null,
      playlists: [],
    });
  }
}
