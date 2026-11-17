import { NextResponse } from "next/server";
import { submitRankedScore } from "@/lib/rankedStore";
import { getSessionUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { categoryId, score, guestNickname, guestUserId } = body;

    if (!categoryId || typeof score !== "number") {
      return NextResponse.json({ success: false, error: "Datos de partida inválidos" }, { status: 400 });
    }

    // Check if user is authenticated
    const sessionUser = await getSessionUser();
    const userId = sessionUser?.id || guestUserId || `guest_${Date.now()}`;
    const nickname = sessionUser?.nickname || guestNickname || "Jugador Ranked";
    const avatarUrl =
      sessionUser?.avatarUrl ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nickname)}&backgroundColor=0B1710`;

    const result = await submitRankedScore(userId, nickname, avatarUrl, categoryId, score);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Error al registrar puntuación ranked." },
      { status: 500 }
    );
  }
}
