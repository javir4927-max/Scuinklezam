import { NextResponse } from "next/server";
import { searchVerifiedTracks } from "@/lib/musicService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get("term") || searchParams.get("q") || "Pop Hits";

  try {
    const tracks = await searchVerifiedTracks(term, 15);
    return NextResponse.json({
      success: true,
      source: "verified_music_service",
      query: term,
      tracks,
    });
  } catch (error: any) {
    console.error("Error in /api/music:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al buscar canciones" },
      { status: 500 }
    );
  }
}
