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
 * Extracts a Spotify playlist or album ID and entity type from URLs, URIs, or raw strings.
 */
interface SpotifyEntityInfo {
  id: string;
  type: "playlist" | "album";
}

function extractSpotifyEntity(input: string): SpotifyEntityInfo | null {
  if (!input) return null;
  const clean = input.trim();

  // Album check
  const albumUrlMatch = clean.match(/album\/([a-zA-Z0-9]+)/i);
  if (albumUrlMatch && albumUrlMatch[1]) return { id: albumUrlMatch[1], type: "album" };

  const albumUriMatch = clean.match(/spotify:album:([a-zA-Z0-9]+)/i);
  if (albumUriMatch && albumUriMatch[1]) return { id: albumUriMatch[1], type: "album" };

  // Playlist check
  const playlistUrlMatch = clean.match(/playlist\/([a-zA-Z0-9]+)/i);
  if (playlistUrlMatch && playlistUrlMatch[1]) return { id: playlistUrlMatch[1], type: "playlist" };

  const playlistUriMatch = clean.match(/spotify:playlist:([a-zA-Z0-9]+)/i);
  if (playlistUriMatch && playlistUriMatch[1]) return { id: playlistUriMatch[1], type: "playlist" };

  // Direct ID check (typically 22 alphanumeric characters) - defaults to playlist
  if (/^[a-zA-Z0-9]{22}$/.test(clean)) {
    return { id: clean, type: "playlist" };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawInput = body.url || body.playlistUrl || body.id || "";
    const entity = extractSpotifyEntity(rawInput);

    if (!entity) {
      return NextResponse.json(
        {
          success: false,
          error: "Introduce un enlace de playlist o álbum de Spotify válido (ej. https://open.spotify.com/playlist/... o https://open.spotify.com/album/...)",
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const { id: entityId, type: entityType } = entity;
    let entityName = entityType === "album" ? "Álbum de Spotify" : "Playlist de Spotify";
    let entityImage = "";
    let resolvedTracks: SpotifyTrackItem[] = [];

    // 1. Try official Spotify API (via User Token or App Token)
    const token = (await getSpotifyUserToken()) || (await getSpotifyAppToken());

    if (token) {
      try {
        const apiPath = entityType === "album" ? `albums/${entityId}` : `playlists/${entityId}`;
        const res = await fetch(`https://api.spotify.com/v1/${apiPath}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          entityName = data.name || entityName;
          entityImage = data.images?.[0]?.url || "";

          let rawTracks: any[] = [];
          if (entityType === "album") {
            rawTracks = (data.tracks?.items || [])
              .filter((t: any) => t && t.id && t.name)
              .map((t: any) => ({
                ...t,
                album: { name: data.name, images: data.images },
              }));
          } else {
            rawTracks = (data.tracks?.items || [])
              .map((item: any) => item.track)
              .filter((t: any) => t && t.id && t.name);
          }

          if (rawTracks.length > 0) {
            const enriched = await enrichSpotifyTracks(rawTracks.slice(0, 35));
            resolvedTracks = enriched.filter(
              (t) => t && t.previewUrl && t.previewUrl.startsWith("http")
            );
          }
        }
      } catch (err) {
        console.warn(`[/api/spotify/playlist] Spotify API fetch failed for ${entityType}, trying public embed fallback:`, err);
      }
    }

    // 2. Fallback: Public Embed and oEmbed Scraper (Zero Auth Required)
    if (resolvedTracks.length === 0) {
      try {
        // First try oEmbed for authoritative title and thumbnail
        try {
          const oembedRes = await fetch(
            `https://open.spotify.com/oembed?url=https://open.spotify.com/${entityType}/${entityId}`,
            { next: { revalidate: 3600 } }
          );
          if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            if (oembedData.title) entityName = oembedData.title;
            if (oembedData.thumbnail_url) entityImage = oembedData.thumbnail_url;
          }
        } catch {
          // ignore oEmbed errors
        }

        // Public embed page
        const embedUrl = `https://open.spotify.com/embed/${entityType}/${entityId}`;
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
            const entityData = nextJson?.props?.pageProps?.state?.data?.entity;

            if (entityData) {
              entityName = entityData.name || entityData.title || entityName;
              if (!entityImage) {
                entityImage =
                  entityData.visualIdentity?.image?.[0]?.url ||
                  entityData.album?.images?.[0]?.url ||
                  entityData.images?.[0]?.url ||
                  "";
              }

              const rawTrackList = entityData.trackList || [];
              const candidates = rawTrackList.slice(0, 30);

              // Process candidates in parallel batches of 6 for speed and responsiveness
              const chunkSize = 6;
              for (let i = 0; i < candidates.length; i += chunkSize) {
                const chunk = candidates.slice(i, i + chunkSize);
                const chunkResults = await Promise.all(
                  chunk.map(async (item: any) => {
                    const trackTitle = item.title || "Canción";
                    const trackArtist = item.subtitle || (entityType === "album" ? entityData.subtitle || "Artista" : "Artista");
                    const trackId =
                      item.id ||
                      item.uri?.split(":").pop() ||
                      Math.random().toString(36).substring(2, 9);
                    let previewUrl = item.audioPreview?.url || null;

                    // Spotify album art if present on track item and distinct from playlist cover
                    let candidateArtwork =
                      item.album?.images?.[0]?.url && item.album.images[0].url !== entityImage
                        ? item.album.images[0].url
                        : entityType === "album" && entityImage
                        ? entityImage
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

                    // Strict fallback
                    if (!candidateArtwork || (candidateArtwork === entityImage && entityType !== "album")) {
                      candidateArtwork = getFallbackArtwork(trackTitle, trackArtist);
                    }

                    if (previewUrl && previewUrl.startsWith("http")) {
                      return {
                        id: trackId,
                        uri: item.uri || `spotify:track:${trackId}`,
                        title: trackTitle,
                        artist: trackArtist,
                        album: item.album?.name || (entityType === "album" ? entityName : "Spotify"),
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
            `No se pudieron encontrar canciones con vista previa de audio en este ${entityType === "album" ? "álbum" : "enlace"}. Comprueba que sea público.`,
        },
        { status: 422, headers: NO_CACHE_HEADERS }
      );
    }

    // Default image if missing
    if (!entityImage && resolvedTracks[0]?.artworkUrl) {
      entityImage = resolvedTracks[0].artworkUrl;
    }

    return NextResponse.json(
      {
        success: true,
        id: entityId,
        type: entityType,
        name: entityName,
        imageUrl: entityImage,
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
        error: error?.message || "Error al procesar el enlace de Spotify",
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
