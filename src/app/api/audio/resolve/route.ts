import { NextResponse } from "next/server";
import { resolveAudioStream } from "@/lib/musicService";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "";
  const artist = searchParams.get("artist") || "";

  if (!title && !artist) {
    return NextResponse.json(
      { success: false, error: "Faltan parámetros 'title' o 'artist'" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const resolved = await resolveAudioStream(title, artist);
    if (!resolved || !resolved.previewUrl) {
      return NextResponse.json(
        { success: false, error: "No se encontró audio disponible para esta canción" },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        previewUrl: resolved.previewUrl,
        artworkUrl: resolved.artworkUrl,
        genre: resolved.genre,
        source: resolved.previewUrl.includes("apple.com") ? "itunes" : "deezer",
      },
      {
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (error: any) {
    console.error("[api/audio/resolve] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al resolver audio" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
