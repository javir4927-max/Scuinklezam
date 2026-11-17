import { NextResponse } from "next/server";
import {
  getSpotifyUserToken,
  getSpotifyAppToken,
  enrichSpotifyTracks,
} from "@/lib/spotifyServer";
import { resolveAudioStream, getFallbackArtwork } from "@/lib/musicService";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

/**
 * Extracts a 22-character Spotify playlist ID from URLs, URIs, or raw strings.
 */
function extractPlaylistId(input: string): string | null {
  if (!input) return null;
  const clean = input.trim();

  // URL format: open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
  const urlMatch = clean.match(/playlist\/([a-zA-Z0-9]+)/i);
  if (urlMatch && urlMatch[1]) return urlMatch[1];

  // URI format: spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
  const uriMatch = clean.match(/spotify:playlist:([a-zA-Z0-9]+)/i);
  if (uriMatch && uriMatch[1]) return uriMatch[1];

  // Direct ID check (typically 22 alphanumeric characters)
  if (/^[a-zA-Z0-9]{22}$/.test(clean)) {
    return clean;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawInput = body.url || body.playlistUrl || body.id || "";
    const playlistId = extractPlaylistId(rawInput);

    if (!playlistId) {
      return NextResponse.json(
        {
          success: false,
          error: "Introduce un enlace de playlist de Spotify válido (ej. https://open.spotify.com/playlist/...)",
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    let playlistName = "Playlist de Spotify";
    let playlistImage = "";
    let resolvedTracks: SpotifyTrackItem[] = [];

    // 1. Try official Spotify API (via User Token or App Token)
    const token = (await getSpotifyUserToken()) || (await getSpotifyAppToken());

    if (token) {
      try {
        const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          playlistName = data.name || playlistName;
          playlistImage = data.images?.[0]?.url || "";

          const rawTracks = (data.tracks?.items || [])
            .map((item: any) => item.track)
            .filter((t: any) => t && t.id && t.name);

          if (rawTracks.length > 0) {
            const enriched = await enrichSpotifyTracks(rawTracks.slice(0, 35));
            resolvedTracks = enriched.filter(
              (t) => t && t.previewUrl && t.previewUrl.startsWith("http")
            );
          }
        }
      } catch (err) {
        console.warn("[/api/spotify/playlist] Spotify API fetch failed, trying public embed fallback:", err);
      }
    }

    // 2. Fallback: Public Embed and oEmbed Scraper (Zero Auth Required)
    if (resolvedTracks.length === 0) {
      try {
        // First try oEmbed for authoritative title and thumbnail
        try {
          const oembedRes = await fetch(
            `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`,
            { next: { revalidate: 3600 } }
          );
          if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            if (oembedData.title) playlistName = oembedData.title;
            if (oembedData.thumbnail_url) playlistImage = oembedData.thumbnail_url;
          }
        } catch {
          // ignore oEmbed errors
        }

        // Public embed page
        const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
        const embedRes = await fetch(embedUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          next: { revalidate: 3600 },
        });

        if (embedRes.ok) {
          const html = await embedRes.text();
          const nextDataMatch = html.match(
            /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/
          );

          if (nextDataMatch) {
            const nextJson = JSON.parse(nextDataMatch[1]);
            const entity = nextJson?.props?.pageProps?.state?.data?.entity;

            if (entity) {
              playlistName = entity.name || entity.title || playlistName;
              if (!playlistImage) {
                playlistImage =
                  entity.visualIdentity?.image?.[0]?.url ||
                  entity.album?.images?.[0]?.url ||
                  "";
              }

              const rawTrackList = entity.trackList || [];
              const candidates = rawTrackList.slice(0, 30);

              // Process candidates in parallel batches of 6 for speed and responsiveness
              const chunkSize = 6;
              for (let i = 0; i < candidates.length; i += chunkSize) {
                const chunk = candidates.slice(i, i + chunkSize);
                const chunkResults = await Promise.all(
                  chunk.map(async (item: any) => {
                    const trackTitle = item.title || "Canción";
                    const trackArtist = item.subtitle || "Artista";
                    const trackId =
                      item.id ||
                      item.uri?.split(":").pop() ||
                      Math.random().toString(36).substring(2, 9);
                    let previewUrl = item.audioPreview?.url || null;

                    // Spotify album art if present on track item and distinct from playlist cover
                    let candidateArtwork =
                      item.album?.images?.[0]?.url && item.album.images[0].url !== playlistImage
                        ? item.album.images[0].url
                        : "";

                    // If missing audio preview OR missing original album artwork, resolve via iTunes
                    if (!previewUrl || !candidateArtwork) {
                      const itunesMatch = await resolveAudioStream(trackTitle, trackArtist);
                      if (itunesMatch) {
                        if (!previewUrl && itunesMatch.previewUrl) {
                          previewUrl = itunesMatch.previewUrl;
                        }
                        if (!candidateArtwork && itunesMatch.artworkUrl) {
                          candidateArtwork = itunesMatch.artworkUrl;
                        }
                      }
                    }

                    // Strict fallback: NEVER assign playlistImage to a song's artwork
                    if (!candidateArtwork || candidateArtwork === playlistImage) {
                      candidateArtwork = getFallbackArtwork(trackTitle, trackArtist);
                    }

                    if (previewUrl && previewUrl.startsWith("http")) {
                      return {
                        id: trackId,
                        uri: item.uri || `spotify:track:${trackId}`,
                        title: trackTitle,
                        artist: trackArtist,
                        album: item.album?.name || playlistName,
                        artworkUrl: candidateArtwork,
                        spotifyUrl: `https://open.spotify.com/track/${trackId}`,
                        previewUrl,
                        durationMs: item.duration || 30000,
                      } as SpotifyTrackItem;
                    }
                    return null;
                  })
                );

                for (const res of chunkResults) {
                  if (res) resolvedTracks.push(res);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("[/api/spotify/playlist] Embed fallback failed:", err);
      }
    }

    if (resolvedTracks.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se pudieron encontrar canciones con vista previa de audio en esta playlist. Comprueba que el enlace sea público.",
        },
        { status: 422, headers: NO_CACHE_HEADERS }
      );
    }

    // Default image if missing
    if (!playlistImage && resolvedTracks[0]?.artworkUrl) {
      playlistImage = resolvedTracks[0].artworkUrl;
    }

    return NextResponse.json(
      {
        success: true,
        id: playlistId,
        name: playlistName,
        imageUrl: playlistImage,
        trackCount: resolvedTracks.length,
        tracks: resolvedTracks,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("[/api/spotify/playlist] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Error al procesar la playlist de Spotify",
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
