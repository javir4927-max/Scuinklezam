import { NextResponse } from "next/server";
import { submitRankedScore, submitArtistRankedScore } from "@/lib/rankedStore";
import { getSessionUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { categoryId, score, guestNickname, guestUserId, categoryName, correctCount, artistName } = body;

    if (!categoryId || typeof score !== "number") {
      return NextResponse.json(
        { success: false, error: "Datos de partida inválidos" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Check if user is authenticated (Email session or Spotify)
    const sessionUser = await getSessionUser();
    const userId = sessionUser?.id || guestUserId || `guest_${Date.now()}`;
    const nickname = sessionUser?.nickname || guestNickname || "Jugador Ranked";
    const avatarUrl =
      sessionUser?.avatarUrl ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nickname)}&backgroundColor=0B1710`;

    const clampedScore = Math.min(1000, Math.max(0, Math.round(score)));

    // 1. Submit to general category ranking
    const result = await submitRankedScore(
      userId,
      nickname,
      avatarUrl,
      categoryId,
      clampedScore,
      categoryName,
      correctCount
    );

    // 2. If this run is for a specific artist, also update the artist ranking (cumulative points, quizzes, best score)
    const targetArtist = artistName || (categoryId.startsWith("artist_") || categoryId.startsWith("custom_") ? categoryName : undefined);
    let artistResult: any = null;
    if (targetArtist) {
      artistResult = await submitArtistRankedScore(
        userId,
        nickname,
        avatarUrl,
        targetArtist,
        clampedScore,
        correctCount
      );
    }

    return NextResponse.json(
      {
        ...result,
        artistResult,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Error al registrar puntuación ranked." },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
