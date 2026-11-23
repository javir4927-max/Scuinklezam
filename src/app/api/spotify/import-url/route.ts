import { NextResponse } from "next/server";
import { importSpotifyCollection } from "@/lib/spotifyImport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = body.url?.trim() || "";

    const result = await importSpotifyCollection(rawUrl);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "No se pudo importar la colección de Spotify" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        type: result.type,
        id: result.id,
        name: result.name,
        imageUrl: result.imageUrl,
        tracks: result.tracks,
        totalTracks: result.tracks.length,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.warn("Import URL error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al procesar la URL de Spotify" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
