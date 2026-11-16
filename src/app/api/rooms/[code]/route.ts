import { NextResponse } from "next/server";
import {
  getRoom,
  joinRoom,
  addBotToRoom,
  updatePlayerTaste,
  injectSpotifyTracksToRoom,
  proposeTheme,
  voteTheme,
  changeRoomSettings,
  startRoomGame,
  submitPlayerAnswer,
  resetRoomToLobby,
  kickPlayer,
  transferHost,
} from "@/lib/roomStore";

interface RouteParams {
  params: {
    code: string;
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  const code = params.code?.toUpperCase();
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("playerId") || undefined;

  const room = await getRoom(code, playerId);

  if (!room) {
    return NextResponse.json(
      { success: false, error: "Sala no encontrada o inactiva." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    room,
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const code = params.code?.toUpperCase();
  const room = await getRoom(code);

  if (!room) {
    return NextResponse.json(
      { success: false, error: "Sala no encontrada." },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const action = body.action;
    const playerId = body.playerId;

    switch (action) {
      case "join": {
        const joinResult = await joinRoom(code, {
          id: playerId || `player_${Date.now()}`,
          name: body.name || "Jugador",
          avatarColor: body.avatarColor,
          favoriteArtists: body.favoriteArtists,
          spotifyConnected: body.spotifyConnected,
        });

        if (!joinResult.success) {
          return NextResponse.json(
            { success: false, error: joinResult.error },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: true, room: joinResult.room });
      }

      case "add_bot": {
        const botResult = await addBotToRoom(code);
        if (!botResult.success) {
          return NextResponse.json(
            { success: false, error: botResult.error },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: true, room: botResult.room, bot: botResult.bot });
      }

      case "update_taste": {
        if (!playerId || !Array.isArray(body.favoriteArtists)) {
          return NextResponse.json({ success: false, error: "Datos incompletos" }, { status: 400 });
        }
        await updatePlayerTaste(code, playerId, body.favoriteArtists);
        return NextResponse.json({ success: true, room: await getRoom(code) });
      }

      case "inject_spotify_tracks": {
        if (!playerId || !Array.isArray(body.tracks)) {
          return NextResponse.json({ success: false, error: "Datos incompletos para inyección de canciones" }, { status: 400 });
        }
        await injectSpotifyTracksToRoom(code, playerId, body.tracks, body.artists);
        return NextResponse.json({ success: true, room: await getRoom(code) });
      }

      case "propose_theme": {
        if (!playerId || !body.label) {
          return NextResponse.json({ success: false, error: "Tema no especificado" }, { status: 400 });
        }
        await proposeTheme(code, playerId, body.label);
        return NextResponse.json({ success: true, room: await getRoom(code) });
      }

      case "vote_theme": {
        if (!playerId || !body.proposalId) {
          return NextResponse.json({ success: false, error: "Propuesta no especificada" }, { status: 400 });
        }
        await voteTheme(code, playerId, body.proposalId);
        return NextResponse.json({ success: true, room: await getRoom(code) });
      }

      case "change_settings": {
        const changed = await changeRoomSettings(code, playerId, {
          gameMode: body.gameMode,
          guessType: body.guessType,
          totalRounds: body.totalRounds,
          name: body.name,
        });
        if (!changed) {
          return NextResponse.json({ success: false, error: "No autorizado o sala no válida" }, { status: 403 });
        }
        return NextResponse.json({ success: true, room: await getRoom(code) });
      }

      case "start_game": {
        const startResult = await startRoomGame(code, playerId);
        if (!startResult.success) {
          return NextResponse.json(
            { success: false, error: startResult.error },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: true, room: await getRoom(code) });
      }

      case "submit_answer": {
        if (typeof body.optionIndex !== "number" || !playerId) {
          return NextResponse.json({ success: false, error: "Respuesta no válida" }, { status: 400 });
        }
        const ansResult = await submitPlayerAnswer(
          room,
          playerId,
          body.optionIndex,
          body.timeMs || 5000,
          body.guessedFriendId
        );
        return NextResponse.json({
          success: true,
          pointsEarned: ansResult.pointsEarned,
          isCorrect: ansResult.isCorrect,
          room: await getRoom(code),
        });
      }

      case "kick_player": {
        if (!playerId || !body.targetPlayerId) {
          return NextResponse.json({ success: false, error: "Datos de expulsión incompletos" }, { status: 400 });
        }
        const kickResult = await kickPlayer(code, playerId, body.targetPlayerId);
        if (!kickResult.success) {
          return NextResponse.json({ success: false, error: kickResult.error }, { status: 400 });
        }
        return NextResponse.json({ success: true, room: kickResult.room });
      }

      case "transfer_host": {
        if (!playerId || !body.targetPlayerId) {
          return NextResponse.json({ success: false, error: "Datos de transferencia incompletos" }, { status: 400 });
        }
        const transferResult = await transferHost(code, playerId, body.targetPlayerId);
        if (!transferResult.success) {
          return NextResponse.json({ success: false, error: transferResult.error }, { status: 400 });
        }
        return NextResponse.json({ success: true, room: transferResult.room });
      }

      case "reset_room": {
        const resetSuccess = await resetRoomToLobby(code, playerId);
        if (!resetSuccess) {
          return NextResponse.json({ success: false, error: "Solo el anfitrión puede reiniciar" }, { status: 403 });
        }
        return NextResponse.json({ success: true, room: await getRoom(code) });
      }

      default:
        return NextResponse.json({ success: false, error: "Acción no reconocida" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Room action error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Error procesando acción" }, { status: 500 });
  }
}
