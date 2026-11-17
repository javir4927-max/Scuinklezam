import { NextResponse } from "next/server";
import { getArtistProfileAndLeaderboard } from "@/lib/rankedStore";
import { getSessionUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const artistName = searchParams.get("name")?.trim();
    const queryUserId = searchParams.get("userId")?.trim();

    if (!artistName) {
      return NextResponse.json(
        { success: false, error: "Nombre de artista no proporcionado." },
        { status: 400 }
      );
    }

    const sessionUser = await getSessionUser();
    const effectiveUserId = sessionUser?.id || queryUserId || undefined;

    const data = await getArtistProfileAndLeaderboard(artistName, effectiveUserId);

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error("[api/ranked/artist] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al obtener ficha de artista." },
      { status: 500 }
    );
  }
}
