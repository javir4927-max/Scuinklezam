import { NextResponse } from "next/server";
import { fetchSpotifyUserAPI } from "@/lib/spotifyServer";
import {
  SpotifyUserProfile,
  SpotifyArtistItem,
  SpotifyPlaylistItem,
} from "@/lib/spotifyTypes";
import { getUserCustomization, resolvePublicAvatarUrl } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Parallel fetch of lightweight Spotify profile, top artists (15), and playlists (25)
    const [profileRes, topArtistsRes, playlistsRes] = await Promise.all([
      fetchSpotifyUserAPI("/v1/me"),
      fetchSpotifyUserAPI("/v1/me/top/artists?time_range=medium_term&limit=15"),
      fetchSpotifyUserAPI("/v1/me/playlists?limit=25"),
    ]);

    if (!profileRes.res || !profileRes.res.ok) {
      return NextResponse.json({
        connected: false,
        user: null,
        stats: null,
        playlists: [],
      });
    }

    const [profileData, topArtistsData, playlistsData] = await Promise.all([
      profileRes.res.json(),
      topArtistsRes.res?.ok ? topArtistsRes.res.json() : Promise.resolve({ items: [] }),
      playlistsRes.res?.ok ? playlistsRes.res.json() : Promise.resolve({ items: [] }),
    ]);

    // 1. User Profile
    const spotifyUid = `spotify_${profileData.id}`;
    const custom = await getUserCustomization(spotifyUid);
    const resolvedAvatar = resolvePublicAvatarUrl(spotifyUid, custom, profileData.images?.[0]?.url || "");

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

    return NextResponse.json({
      connected: true,
      user,
      stats: {
        topTracksShort: [],
        topTracksMedium: [],
        topArtists,
        recentlyPlayed: [],
        likedTracks: [],
      },
      playlists,
    });
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
