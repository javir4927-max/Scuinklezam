import { NextResponse } from "next/server";
import { getSpotifyAppToken, enrichSpotifyTracks } from "@/lib/spotifyServer";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";

/**
 * Fallback audio resolver using iTunes search API
 */
async function resolveAudioStream(title: string, artist: string): Promise<string | null> {
  try {
    const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    const query = `${cleanTitle} ${artist}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].previewUrl || null;
    }
  } catch {
    // Fail silently
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = body.url?.trim() || "";

    if (!rawUrl) {
      return NextResponse.json(
        { success: false, error: "Por favor, introduce una URL de Spotify válida." },
        { status: 400 }
      );
    }

    // Parse URL / URI: playlist, album or artist
    // e.g. https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
    let type = "playlist";
    let id = "";

    const matchWeb = rawUrl.match(/open\.spotify\.com\/(playlist|album|artist)\/([a-zA-Z0-9]+)/);
    const matchUri = rawUrl.match(/spotify:(playlist|album|artist):([a-zA-Z0-9]+)/);

    if (matchWeb) {
      type = matchWeb[1];
      id = matchWeb[2];
    } else if (matchUri) {
      type = matchUri[1];
      id = matchUri[2];
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "URL no reconocida. Introduce un enlace de Playlist, Álbum o Artista de Spotify.",
        },
        { status: 400 }
      );
    }

    // METHOD 1: Try official Spotify API if app token is available
    const token = await getSpotifyAppToken();
    if (token) {
      try {
        let apiUrl = `https://api.spotify.com/v1/playlists/${id}`;
        if (type === "album") apiUrl = `https://api.spotify.com/v1/albums/${id}`;
        if (type === "artist") apiUrl = `https://api.spotify.com/v1/artists/${id}/top-tracks?market=ES`;

        const res = await fetch(apiUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const entityName = data.name || (type === "artist" ? `Top de ${data.tracks?.[0]?.artists?.[0]?.name || "Artista"}` : "Spotify Mix");
          let rawTracks: any[] = [];

          if (type === "playlist") {
            rawTracks = data.tracks?.items?.map((item: any) => item.track).filter(Boolean) || [];
          } else if (type === "album") {
            rawTracks = data.tracks?.items?.map((item: any) => ({
              ...item,
              album: { images: data.images, name: data.name },
            })) || [];
          } else if (type === "artist") {
            rawTracks = data.tracks || [];
          }

          const enriched = await enrichSpotifyTracks(rawTracks.slice(0, 30));
          if (enriched.length > 0) {
            return NextResponse.json({
              success: true,
              name: entityName,
              type,
              tracks: enriched,
              source: "spotify_api",
            });
          }
        }
      } catch (err) {
        console.warn("Spotify API import error, falling back to public embed extraction:", err);
      }
    }

    // METHOD 2: Universal Public Embed Extractor (Zero Keys Required)
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 3600 },
    });

    if (!embedRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo acceder a la playlist de Spotify. Comprueba que sea pública.",
        },
        { status: 404 }
      );
    }

    const html = await embedRes.text();
    let entityName = "Playlist de Spotify";
    let rawTrackList: any[] = [];

    // Parse __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextJson = JSON.parse(nextDataMatch[1]);
        const entity = nextJson?.props?.pageProps?.state?.data?.entity;
        if (entity) {
          entityName = entity.name || entity.title || entityName;
          rawTrackList = entity.trackList || [];
        }
      } catch (e) {
        console.warn("Failed to parse __NEXT_DATA__ JSON from Spotify embed:", e);
      }
    }

    if (rawTrackList.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se encontraron canciones en esta playlist pública o el formato cambió.",
        },
        { status: 422 }
      );
    }

    // Normalize up to 25 tracks
    const selectedList = rawTrackList.slice(0, 25);
    const resolvedTracks: SpotifyTrackItem[] = [];

    for (const t of selectedList) {
      const trackTitle = t.title || "Canción";
      const trackArtist = t.subtitle || "Artista";
      const trackId = t.id || t.uri?.split(":").pop() || Math.random().toString(36).substring(2, 9);
      let previewUrl = t.audioPreview?.url || null;

      // Parallel resolution fallback via iTunes if Spotify preview is null
      if (!previewUrl) {
        previewUrl = await resolveAudioStream(trackTitle, trackArtist);
      }

      const artwork =
        t.visualIdentity?.image?.[0]?.url ||
        t.album?.images?.[0]?.url ||
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60";

      resolvedTracks.push({
        id: trackId,
        uri: t.uri || `spotify:track:${trackId}`,
        title: trackTitle,
        artist: trackArtist,
        album: entityName,
        artworkUrl: artwork,
        spotifyUrl: `https://open.spotify.com/track/${trackId}`,
        previewUrl,
        durationMs: t.duration || 30000,
      });
    }

    return NextResponse.json({
      success: true,
      name: entityName,
      type,
      tracks: resolvedTracks,
      source: "universal_embed",
    });
  } catch (error: any) {
    console.error("Error importing Spotify URL:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al importar el enlace de Spotify" },
      { status: 500 }
    );
  }
}
