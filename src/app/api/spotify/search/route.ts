import { NextResponse } from "next/server";
import { searchVerifiedTracks } from "@/lib/musicService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || searchParams.get("term") || "Pop Hits";

  try {
    const tracks = await searchVerifiedTracks(q, 15);
    return NextResponse.json({
      success: true,
      source: "verified_search",
      query: q,
      tracks,
    });
  } catch (error: any) {
    console.error("Error in /api/spotify/search:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al buscar canciones" },
      { status: 500 }
    );
  }
}
