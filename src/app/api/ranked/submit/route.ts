import { NextResponse } from "next/server";
import { submitRankedScore, submitArtistRankedScore } from "@/lib/rankedStore";
import { getSessionUser } from "@/lib/userAuth";
import { RANKED_CATEGORIES, toArtistSlug, getCanonicalArtistName } from "@/lib/rankedTypes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { categoryId, score, guestNickname, guestUserId, categoryName, correctCount, artistName, roundScores } = body;

    if (!categoryId || typeof score !== "number") {
      return NextResponse.json(
        { success: false, error: "Datos de partida inválidos" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    let authoritativeScore: number;
    if (Array.isArray(roundScores) && roundScores.length > 0) {
      const sanitized = roundScores
        .slice(0, 10)
        .map((p) => Math.min(100, Math.max(0, Math.round(Number(p) || 0))));
      authoritativeScore = Math.min(1000, sanitized.reduce((a, b) => a + b, 0));
    } else {
      authoritativeScore = Math.min(1000, Math.max(0, Math.round(score)));
    }

    // Check if user is authenticated (Email session or Spotify)
    const sessionUser = await getSessionUser();
    const userId = sessionUser?.id || guestUserId || `guest_${Date.now()}`;
    const nickname = sessionUser?.nickname || guestNickname || "Jugador Ranked";
    const avatarUrl =
      sessionUser?.avatarUrl ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nickname)}&backgroundColor=0B1710`;

    // Normalize canonical artist slug/categoryId to prevent duplicate rankings across aliases
    const targetArtist =
      artistName ||
      (categoryId.startsWith("artist_") || categoryId.startsWith("custom_") ? categoryName : undefined);
    const canonicalArtistName = targetArtist ? getCanonicalArtistName(targetArtist) : undefined;
    let canonicalCategoryId = categoryId;
    if (canonicalArtistName) {
      const slug = toArtistSlug(canonicalArtistName);
      const matchedBase = RANKED_CATEGORIES.find(
        (c) => c.kind === "artist" && toArtistSlug(c.query || c.name) === slug
      );
      canonicalCategoryId = matchedBase ? matchedBase.id : `artist_${slug.replace(/-/g, "_")}`;
    }

    // 1. Submit to general cumulative category & global ranking
    const result = await submitRankedScore(
      userId,
      nickname,
      avatarUrl,
      canonicalCategoryId,
      authoritativeScore,
      canonicalArtistName || categoryName,
      correctCount
    );

    // 2. If this run is for a specific artist, also update the artist ranking (cumulative totalPoints, quizzes, bestScore, popularity)
    let artistResult: any = null;
    if (canonicalArtistName) {
      artistResult = await submitArtistRankedScore(
        userId,
        nickname,
        avatarUrl,
        canonicalArtistName,
        authoritativeScore,
        correctCount
      );
    }

    return NextResponse.json(
      {
        ...result,
        submittedScore: authoritativeScore,
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
