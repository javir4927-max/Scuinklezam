import { fetchSpotifyUserAPI, getSpotifyAppToken, enrichSpotifyTracks } from "@/lib/spotifyServer";
import { resolveAudioStream, getFallbackArtwork } from "@/lib/musicService";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";

export interface ImportedCollectionResult {
  success: boolean;
  id: string;
  type: "playlist" | "album" | "artist";
  name: string;
  imageUrl: string;
  trackCount: number;
  tracks: SpotifyTrackItem[];
  error?: string;
}

interface ParsedSpotifyTarget {
  id: string;
  type: "playlist" | "album" | "artist";
}

/**
 * Resolves short links (spotify.link / spoti.fi) and parses Spotify collections.
 */
export async function parseSpotifyTarget(rawInput: string): Promise<ParsedSpotifyTarget | null> {
  if (!rawInput) return null;
  let clean = rawInput.trim();

  // If short link, follow redirects
  if (/https?:\/\/(spotify\.link|spoti\.fi)\/[a-zA-Z0-9]+/i.test(clean)) {
    try {
      const headRes = await fetch(clean, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(3000),
      });
      if (headRes.url) {
        clean = headRes.url;
      }
    } catch {
      // Continue with clean as is
    }
  }

  // Web URL (accepts language prefixes like /intl-es/album/...)
  const webMatch = clean.match(/(?:open\.spotify\.com|spotify\.com)(?:\/[a-zA-Z]{2}(?:-[a-zA-Z]{2})?)?\/(playlist|album|artist)\/([a-zA-Z0-9]{22})/i) ||
                   clean.match(/(?:open\.spotify\.com|spotify\.com)(?:\/[a-zA-Z]{2}(?:-[a-zA-Z]{2})?)?\/(playlist|album|artist)\/([a-zA-Z0-9]+)/i);
  if (webMatch && webMatch[1] && webMatch[2]) {
    return {
      type: webMatch[1].toLowerCase() as "playlist" | "album" | "artist",
      id: webMatch[2],
    };
  }

  // URI match: spotify:album:... or spotify:playlist:... or spotify:artist:...
  const uriMatch = clean.match(/spotify:(playlist|album|artist):([a-zA-Z0-9]+)/i);
  if (uriMatch && uriMatch[1] && uriMatch[2]) {
    return {
      type: uriMatch[1].toLowerCase() as "playlist" | "album" | "artist",
      id: uriMatch[2],
    };
  }

  // Direct 22-char ID defaults to playlist
  if (/^[a-zA-Z0-9]{22}$/.test(clean)) {
    return {
      type: "playlist",
      id: clean,
    };
  }

  return null;
}

/**
 * Unified fast Spotify collection importer with anti-timeout (6500ms budget).
 */
export async function importSpotifyCollection(rawInput: string): Promise<ImportedCollectionResult> {
  const target = await parseSpotifyTarget(rawInput);
  if (!target) {
    return {
      success: false,
      id: "",
      type: "playlist",
      name: "",
      imageUrl: "",
      trackCount: 0,
      tracks: [],
      error: "Por favor, introduce un enlace válido de Playlist o Álbum de Spotify (open.spotify.com/...)",
    };
  }

  const { id, type } = target;
  let collectionName = type === "album" ? "Álbum de Spotify" : type === "artist" ? "Artista de Spotify" : "Playlist de Spotify";
  let collectionImage = "";
  let rawCandidates: any[] = [];

  // --- 1A. Try Authenticated User API (auto-refreshes on 401) ---
  try {
    const apiEndpoint = type === "album" ? `/v1/albums/${id}` : type === "artist" ? `/v1/artists/${id}/top-tracks?market=ES` : `/v1/playlists/${id}`;
    const userRes = await fetchSpotifyUserAPI(apiEndpoint);
    if (userRes?.res?.ok) {
      const data = await userRes.res.json();
      collectionName = data.name || collectionName;
      collectionImage = data.images?.[0]?.url || "";

      if (type === "album") {
        const albumData = { id: data.id, name: data.name, images: data.images || [] };
        rawCandidates = (data.tracks?.items || [])
          .filter((t: any) => t && t.id && t.name)
          .map((t: any) => ({
            ...t,
            album: albumData,
          }));
      } else if (type === "artist") {
        rawCandidates = (data.tracks || []).filter((t: any) => t && t.id && t.name);
      } else {
        rawCandidates = (data.tracks?.items || [])
          .filter((item: any) => item?.track && !item.track.is_local && item.track.id && item.track.name)
          .map((item: any) => item.track);
      }
    }
  } catch {}

  // --- 1B. Fallback to Spotify App Token ---
  if (rawCandidates.length === 0) {
    try {
      const appToken = await getSpotifyAppToken();
      if (appToken) {
        const apiPath = type === "album" ? `albums/${id}` : type === "artist" ? `artists/${id}/top-tracks?market=ES` : `playlists/${id}`;
        const appRes = await fetch(`https://api.spotify.com/v1/${apiPath}`, {
          headers: { Authorization: `Bearer ${appToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(3500),
        });
        if (appRes.ok) {
          const data = await appRes.json();
          collectionName = data.name || collectionName;
          collectionImage = data.images?.[0]?.url || collectionImage;

          if (type === "album") {
            const albumData = { id: data.id, name: data.name, images: data.images || [] };
            rawCandidates = (data.tracks?.items || [])
              .filter((t: any) => t && t.id && t.name)
              .map((t: any) => ({
                ...t,
                album: albumData,
              }));
          } else if (type === "artist") {
            rawCandidates = (data.tracks || []).filter((t: any) => t && t.id && t.name);
          } else {
            rawCandidates = (data.tracks?.items || [])
              .filter((item: any) => item?.track && !item.track.is_local && item.track.id && item.track.name)
              .map((item: any) => item.track);
          }
        }
      }
    } catch {}
  }

  // --- 2. Fallback to Public Embed (cache: "no-store") ---
  if (rawCandidates.length === 0) {
    try {
      // First try oEmbed for authoritative title & cover
      try {
        const oembedRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/${type}/${id}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2500),
        });
        if (oembedRes.ok) {
          const odata = await oembedRes.json();
          if (odata.title) collectionName = odata.title;
          if (odata.thumbnail_url) collectionImage = odata.thumbnail_url;
        }
      } catch {}

      const embedRes = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      });

      if (embedRes.ok) {
        const html = await embedRes.text();
        const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
        if (nextMatch) {
          const nextJson = JSON.parse(nextMatch[1]);
          const entity = nextJson?.props?.pageProps?.state?.data?.entity;
          if (entity) {
            collectionName = entity.name || entity.title || collectionName;
            if (!collectionImage) {
              collectionImage =
                entity.coverArt?.sources?.[0]?.url ||
                entity.visualIdentity?.image?.[0]?.url ||
                entity.album?.images?.[0]?.url ||
                entity.images?.[0]?.url ||
                "";
            }

            const rawTrackList = entity.trackList || [];
            rawCandidates = rawTrackList.map((item: any) => {
              const cleanArtist = (item.subtitle || entity.subtitle || "Artista").replace(/\u00a0/g, " ").trim();
              return {
                id: item.id || item.uri?.split(":").pop() || Math.random().toString(36).substring(2, 9),
                name: (item.title || "Canción").replace(/\u00a0/g, " ").trim(),
                artists: [{ name: cleanArtist }],
                album: {
                  name: entity.name || collectionName,
                  images: collectionImage ? [{ url: collectionImage }] : [],
                },
                preview_url: item.audioPreview?.url || null,
                duration_ms: item.duration || 30000,
              };
            });
          }
        }
      }
    } catch {}
  }

  // --- 3. Extra fallback for Albums via iTunes Search & Lookup if no tracks found ---
  if (rawCandidates.length === 0 && type === "album" && collectionName && collectionName !== "Álbum de Spotify") {
    try {
      const itunesSearch = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(collectionName)}&entity=album&country=ES&limit=3`,
        { signal: AbortSignal.timeout(2500) }
      );
      if (itunesSearch.ok) {
        const sData = await itunesSearch.json();
        const matchedCollection = sData.results?.[0];
        if (matchedCollection?.collectionId) {
          const lookupRes = await fetch(
            `https://itunes.apple.com/lookup?id=${matchedCollection.collectionId}&entity=song`,
            { signal: AbortSignal.timeout(2500) }
          );
          if (lookupRes.ok) {
            const lData = await lookupRes.json();
            const songs = (lData.results || []).filter((r: any) => r.wrapperType === "track");
            if (songs.length > 0) {
              if (!collectionImage && matchedCollection.artworkUrl100) {
                collectionImage = matchedCollection.artworkUrl100.replace("100x100bb", "600x600bb");
              }
              rawCandidates = songs.map((s: any) => ({
                id: String(s.trackId),
                name: s.trackName,
                artists: [{ name: s.artistName }],
                album: {
                  name: s.collectionName,
                  images: collectionImage ? [{ url: collectionImage }] : [],
                },
                preview_url: s.previewUrl,
                duration_ms: s.trackTimeMillis || 30000,
              }));
            }
          }
        }
      }
    } catch {}
  }

  if (rawCandidates.length === 0) {
    return {
      success: false,
      id,
      type,
      name: collectionName,
      imageUrl: collectionImage,
      trackCount: 0,
      tracks: [],
      error: `No se pudieron cargar canciones para este ${type === "album" ? "álbum" : type === "artist" ? "artista" : "enlace"}. Comprueba que sea público.`,
    };
  }

  // --- 4. Parallel audio resolution with 6500ms time budget anti-504 ---
  const startTime = Date.now();
  const TIME_BUDGET_MS = 6500;
  const targetTracks = rawCandidates.slice(0, 30);
  const resolvedTracks: SpotifyTrackItem[] = [];

  // Fast pass: enrich tracks that already have preview URLs or query in batches of 8
  const chunkSize = 8;
  for (let i = 0; i < targetTracks.length; i += chunkSize) {
    // If budget exceeded and we already have at least 4 playable songs, return immediately
    if (Date.now() - startTime >= TIME_BUDGET_MS && resolvedTracks.length >= 4) {
      break;
    }

    const chunk = targetTracks.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (item: any) => {
        const trackTitle = item.name || item.title || "Canción";
        const trackArtist =
          item.artists?.map((a: any) => a.name).join(", ") ||
          item.subtitle ||
          (type === "artist" ? collectionName : "Artista");
        const trackId = item.id || item.uri?.split(":").pop() || Math.random().toString(36).substring(2, 9);
        let previewUrl = item.preview_url || item.audioPreview?.url || null;

        // Album cover: in album mode, KEEP the album cover!
        let candidateArtwork = "";
        if (type === "album") {
          candidateArtwork = item.album?.images?.[0]?.url || collectionImage || "";
        } else {
          candidateArtwork = item.album?.images?.[0]?.url && item.album.images[0].url !== collectionImage
            ? item.album.images[0].url
            : "";
        }

        if (!previewUrl || !candidateArtwork) {
          const resolved = await resolveAudioStream(trackTitle, trackArtist);
          if (resolved) {
            if (!previewUrl && resolved.previewUrl) previewUrl = resolved.previewUrl;
            if (!candidateArtwork && resolved.artworkUrl) candidateArtwork = resolved.artworkUrl;
          }
        }

        if (!candidateArtwork || (candidateArtwork === collectionImage && type !== "album")) {
          candidateArtwork = getFallbackArtwork(trackTitle, trackArtist);
        }

        if (previewUrl && previewUrl.startsWith("http")) {
          return {
            id: trackId,
            uri: item.uri || `spotify:track:${trackId}`,
            title: trackTitle,
            artist: trackArtist,
            album: item.album?.name || (type === "album" ? collectionName : "Spotify"),
            artworkUrl: candidateArtwork,
            spotifyUrl: `https://open.spotify.com/track/${trackId}`,
            previewUrl,
            durationMs: item.duration_ms || item.duration || 30000,
          } as SpotifyTrackItem;
        }
        return null;
      })
    );

    for (const r of chunkResults) {
      if (r.status === "fulfilled" && r.value) {
        resolvedTracks.push(r.value);
      }
    }
  }

  if (resolvedTracks.length === 0) {
    return {
      success: false,
      id,
      type,
      name: collectionName,
      imageUrl: collectionImage,
      trackCount: 0,
      tracks: [],
      error: `No se pudieron encontrar canciones con vista previa de audio en este ${type === "album" ? "álbum" : "enlace"}.`,
    };
  }

  if (!collectionImage && resolvedTracks[0]?.artworkUrl) {
    collectionImage = resolvedTracks[0].artworkUrl;
  }

  return {
    success: true,
    id,
    type,
    name: collectionName,
    imageUrl: collectionImage,
    trackCount: resolvedTracks.length,
    tracks: resolvedTracks,
  };
}
