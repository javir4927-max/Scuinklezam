import { NextResponse } from "next/server";
import { getArtistProfileAndLeaderboard } from "@/lib/rankedStore";
import { getSessionUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const artistName = searchParams.get("name")?.trim();
    const queryUserId = searchParams.get("userId")?.trim();

    if (!artistName) {
      return NextResponse.json(
        { success: false, error: "Nombre de artista no proporcionado." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const sessionUser = await getSessionUser();
    const effectiveUserId = sessionUser?.id || queryUserId || undefined;

    const data = await getArtistProfileAndLeaderboard(artistName, effectiveUserId);

    return NextResponse.json(
      {
        success: true,
        ...data,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("[api/ranked/artist] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al obtener ficha de artista." },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
