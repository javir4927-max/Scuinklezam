if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { NextResponse } from "next/server";
import {
  getRoom,
  joinRoom,
  leaveRoom,
  updatePlayerTaste,
  injectSpotifyTracksToRoom,
  proposeTheme,
  voteTheme,
  castVote,
  changeRoomSettings,
  startRoomGame,
  submitPlayerAnswer,
  advanceRoomRound,
  resetRoomToLobby,
  kickPlayer,
  transferHost,
  renamePlayer,
  updatePlayerProfile,
  addPlaylistToRoom,
  removePlaylistFromRoom,
} from "@/lib/roomStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

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
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      success: true,
      room,
    },
    { headers: NO_CACHE_HEADERS }
  );
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const code = params.code?.toUpperCase();
  const room = await getRoom(code);

  if (!room) {
    return NextResponse.json(
      { success: false, error: "Sala no encontrada." },
      { status: 404, headers: NO_CACHE_HEADERS }
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
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: joinResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }


      case "update_taste": {
        if (!playerId || !Array.isArray(body.favoriteArtists)) {
          return NextResponse.json(
            { success: false, error: "Datos incompletos" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        await updatePlayerTaste(code, playerId, body.favoriteArtists);
        const updated = await getRoom(code);
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "inject_spotify_tracks": {
        if (!playerId || !Array.isArray(body.tracks)) {
          return NextResponse.json(
            { success: false, error: "Datos incompletos para inyección de canciones" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        await injectSpotifyTracksToRoom(code, playerId, body.tracks, body.artists, body.label, body.modeName);
        const updated = await getRoom(code);
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "propose_theme": {
        if (!playerId || !body.label) {
          return NextResponse.json(
            { success: false, error: "Tema no especificado" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        await proposeTheme(code, playerId, body.label);
        const updated = await getRoom(code);
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "vote_theme": {
        if (!playerId || !body.proposalId) {
          return NextResponse.json(
            { success: false, error: "Propuesta no especificada" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        await voteTheme(code, playerId, body.proposalId);
        const updated = await getRoom(code);
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "leave_room": {
        if (!playerId) {
          return NextResponse.json(
            { success: false, error: "playerId requerido" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const leaveResult = await leaveRoom(code, playerId);
        return NextResponse.json(
          { success: true, room: leaveResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "cast_vote": {
        const themeId = body.themeId;
        if (!playerId || !themeId) {
          return NextResponse.json(
            { success: false, error: "Datos de voto no válidos" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }

        const voteResult = await castVote(code, playerId, themeId);
        return NextResponse.json(
          { success: true, room: voteResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "change_settings": {
        const changed = await changeRoomSettings(code, playerId, {
          gameMode: body.gameMode,
          guessType: body.guessType,
          totalRounds: body.totalRounds,
          name: body.name,
        });
        if (!changed) {
          return NextResponse.json(
            { success: false, error: "No autorizado o sala no válida" },
            { status: 403, headers: NO_CACHE_HEADERS }
          );
        }
        const updated = await getRoom(code);
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "start_game": {
        const startResult = await startRoomGame(code, playerId);
        if (!startResult.success) {
          return NextResponse.json(
            { success: false, error: startResult.error },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const updated = startResult.room || (await getRoom(code));
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "submit_answer": {
        if (typeof body.optionIndex !== "number" || !playerId) {
          return NextResponse.json(
            { success: false, error: "Respuesta no válida" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const ansResult = await submitPlayerAnswer(
          code,
          playerId,
          body.optionIndex,
          body.timeMs || 5000,
          body.guessedFriendId,
          typeof body.roundIndex === "number" ? body.roundIndex : undefined,
          typeof body.selectedTitle === "string" ? body.selectedTitle : undefined,
          typeof body.optionId === "string" ? body.optionId : undefined
        );
        const updated = ansResult.room || (await getRoom(code));
        return NextResponse.json(
          {
            success: true,
            pointsEarned: ansResult.pointsEarned,
            isCorrect: ansResult.isCorrect,
            room: updated,
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "next_round": {
        const expectedRoundIndex =
          typeof body.expectedRoundIndex === "number" ? body.expectedRoundIndex : room.currentRound;
        const advanceResult = await advanceRoomRound(code, playerId || "", expectedRoundIndex);
        const updated = advanceResult.room || (await getRoom(code));
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "kick_player": {
        if (!playerId || !body.targetPlayerId) {
          return NextResponse.json(
            { success: false, error: "Datos de expulsión incompletos" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const kickResult = await kickPlayer(code, playerId, body.targetPlayerId);
        if (!kickResult.success) {
          return NextResponse.json(
            { success: false, error: kickResult.error },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: kickResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "transfer_host": {
        if (!playerId || !body.targetPlayerId) {
          return NextResponse.json(
            { success: false, error: "Datos de transferencia incompletos" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const transferResult = await transferHost(code, playerId, body.targetPlayerId);
        if (!transferResult.success) {
          return NextResponse.json(
            { success: false, error: transferResult.error },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: transferResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "rename_player": {
        if (!playerId || !body.name) {
          return NextResponse.json(
            { success: false, error: "Nombre no especificado" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const renameResult = await renamePlayer(code, playerId, body.name);
        if (!renameResult.success) {
          return NextResponse.json(
            { success: false, error: renameResult.error },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: renameResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "update_player_profile": {
        if (!playerId) {
          return NextResponse.json(
            { success: false, error: "Player ID requerido" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const updateResult = await updatePlayerProfile(code, playerId, {
          name: typeof body.name === "string" ? body.name : undefined,
          avatarColor: typeof body.avatarColor === "string" ? body.avatarColor : undefined,
        });
        if (!updateResult.success) {
          return NextResponse.json(
            { success: false, error: updateResult.error },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: updateResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "add_playlist": {
        if (!playerId || !body.playlist) {
          return NextResponse.json(
            { success: false, error: "Datos de playlist incompletos" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const addResult = await addPlaylistToRoom(code, playerId, body.playlist);
        if (!addResult.success) {
          return NextResponse.json(
            { success: false, error: addResult.error },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: addResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "remove_playlist": {
        if (!playerId || !body.playlistId) {
          return NextResponse.json(
            { success: false, error: "ID de playlist no especificado" },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const removeResult = await removePlaylistFromRoom(code, playerId, body.playlistId);
        if (!removeResult.success) {
          return NextResponse.json(
            { success: false, error: removeResult.error },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: removeResult.room },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "reset_room":
      case "reset_to_lobby": {
        const resetSuccess = await resetRoomToLobby(code, playerId);
        if (!resetSuccess) {
          return NextResponse.json(
            { success: false, error: "Solo el anfitrión puede reiniciar la sala." },
            { status: 403, headers: NO_CACHE_HEADERS }
          );
        }
        const updated = await getRoom(code);
        return NextResponse.json(
          { success: true, room: updated },
          { headers: NO_CACHE_HEADERS }
        );
      }

      default:
        return NextResponse.json(
          { success: false, error: "Acción no reconocida" },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
    }
  } catch (error: any) {
    console.error("Room action error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error procesando acción" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const code = params.code?.toUpperCase();
  try {
    let body: any = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json().catch(() => ({}));
    } else {
      const text = await request.text().catch(() => "");
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

    if (body.action === "leave_room" && body.playerId) {
      const leaveResult = await leaveRoom(code, body.playerId);
      return NextResponse.json(
        { success: true, room: leaveResult.room },
        { headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: "Acción POST no reconocida" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("Room POST action error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error procesando acción" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
