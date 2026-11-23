import { NextResponse } from "next/server";
import { createRoom } from "@/lib/roomStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const hostName = body.hostName?.trim() || "Anfitrión";
    const hostId = body.hostId || `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const roomName = body.roomName;
    const initialArtists = Array.isArray(body.initialArtists) ? body.initialArtists : [];
    const hostCustomization = {
      avatarUrl: body.avatarUrl,
      rankTier: body.rankTier,
      equippedTitle: body.equippedTitle,
    };

    const room = await createRoom(hostName, hostId, roomName, initialArtists, hostCustomization);

    return NextResponse.json(
      {
        success: true,
        room,
        hostId,
        serverTime: Date.now(),
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("Error creating room:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al crear la sala" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
