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
    const rawInput = body.url || body.playlistUrl || body.id || "";

    const result = await importSpotifyCollection(rawInput);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "No se pudo procesar la playlist o álbum de Spotify",
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
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
