import { NextResponse } from "next/server";
import {
  fetchSpotifyUserAPI,
  enrichSpotifyTracks,
} from "@/lib/spotifyServer";
import {
  SpotifyUserProfile,
  SpotifyArtistItem,
  SpotifyPlaylistItem,
} from "@/lib/spotifyTypes";
import { getUserCustomization } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profileRes = await fetchSpotifyUserAPI("/v1/me");
    if (!profileRes.res || !profileRes.res.ok) {
      return NextResponse.json({
        connected: false,
        user: null,
        stats: null,
        playlists: [],
      });
    }

    const profileData = await profileRes.res.json();

    // Parallel fetch across official Spotify endpoints with auto-refreshing token
    const [
      topTracksMedRes,
      topTracksShortRes,
      topArtistsRes,
      recentlyPlayedRes,
      likedTracksRes,
      playlistsRes,
    ] = await Promise.all([
      fetchSpotifyUserAPI("/v1/me/top/tracks?time_range=medium_term&limit=50"),
      fetchSpotifyUserAPI("/v1/me/top/tracks?time_range=short_term&limit=50"),
      fetchSpotifyUserAPI("/v1/me/top/artists?time_range=medium_term&limit=15"),
      fetchSpotifyUserAPI("/v1/me/player/recently-played?limit=50"),
      fetchSpotifyUserAPI("/v1/me/tracks?limit=50"),
      fetchSpotifyUserAPI("/v1/me/playlists?limit=25"),
    ]);

    const topTracksMedData = topTracksMedRes.res?.ok ? await topTracksMedRes.res.json() : { items: [] };
    const topTracksShortData = topTracksShortRes.res?.ok ? await topTracksShortRes.res.json() : { items: [] };
    const topArtistsData = topArtistsRes.res?.ok ? await topArtistsRes.res.json() : { items: [] };
    const recentlyPlayedData = recentlyPlayedRes.res?.ok ? await recentlyPlayedRes.res.json() : { items: [] };
    const likedTracksData = likedTracksRes.res?.ok ? await likedTracksRes.res.json() : { items: [] };
    const playlistsData = playlistsRes.res?.ok ? await playlistsRes.res.json() : { items: [] };

    // 1. User Profile
    const custom = await getUserCustomization(`spotify_${profileData.id}`);
    const resolvedAvatar = custom?.customAvatarUrl || profileData.images?.[0]?.url || "";

    const user: SpotifyUserProfile = {
      id: profileData.id,
      displayName: profileData.display_name || profileData.id,
      email: profileData.email,
      avatarUrl: resolvedAvatar,
      imageUrl: resolvedAvatar,
      product: profileData.product || "free",
      isPremium: profileData.product === "premium",
    };

    // 2. Top Artists (up to 15)
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

    // 4. Enrich tracks with iTunes Search API audio preview & artwork resolution
    const [topTracksMedium, topTracksShort, recentlyPlayed, likedTracks] = await Promise.all([
      enrichSpotifyTracks(topTracksMedData.items || []),
      enrichSpotifyTracks(topTracksShortData.items || []),
      enrichSpotifyTracks((recentlyPlayedData.items || []).map((i: any) => i.track)),
      enrichSpotifyTracks((likedTracksData.items || []).map((i: any) => i.track)),
    ]);

    const response = NextResponse.json({
      connected: true,
      user,
      stats: {
        topTracksShort: topTracksShort.filter((t) => t.previewUrl),
        topTracksMedium: topTracksMedium.filter((t) => t.previewUrl),
        topArtists,
        recentlyPlayed: recentlyPlayed.filter((t) => t.previewUrl),
        likedTracks: likedTracks.filter((t) => t.previewUrl),
      },
      playlists,
    });

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
