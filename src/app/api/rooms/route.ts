import { NextResponse } from "next/server";
import { createRoom } from "@/lib/roomStore";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const hostName = body.hostName || "Anfitrión";
    const hostId = body.hostId || `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const roomName = body.roomName;
    const initialArtists = Array.isArray(body.initialArtists) ? body.initialArtists : [];

    const room = await createRoom(hostName, hostId, roomName, initialArtists);

    return NextResponse.json({
      success: true,
      room,
      hostId,
    });
  } catch (error: any) {
    console.error("Error creating room:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al crear la sala" },
      { status: 500 }
    );
  }
}
