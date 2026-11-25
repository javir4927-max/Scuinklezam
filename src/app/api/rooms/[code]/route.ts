if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { NextResponse } from "next/server";
import {
  getRoom,
  checkRoomUnchanged,
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
  rematchRoomGame,
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
  const playerId = searchParams.get("playerId") || searchParams.get("p") || undefined;
  const clientVersion = Number(searchParams.get("v") || "0");
  const shouldHeartbeat = searchParams.get("hb") === "1";

  const check = await checkRoomUnchanged(code, clientVersion, playerId, shouldHeartbeat);
  if (check.notFound === true) {
    return NextResponse.json(
      { success: false, error: "Sala no encontrada o inactiva.", serverTime: Date.now() },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }
  if (check.unchanged) {
    return NextResponse.json(
      {
        success: true,
        unchanged: true,
        version: check.version,
        serverTime: Date.now(),
      },
      { headers: NO_CACHE_HEADERS }
    );
  }

  const room = await getRoom(code, shouldHeartbeat ? playerId : undefined);

  if (!room) {
    return NextResponse.json(
      { success: false, error: "Sala no encontrada o inactiva.", serverTime: Date.now() },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      success: true,
      room,
      serverTime: Date.now(),
    },
    { headers: NO_CACHE_HEADERS }
  );
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const code = params.code?.toUpperCase();

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
          avatarUrl: body.avatarUrl,
          rankTier: body.rankTier,
          equippedTitle: body.equippedTitle,
        });

        if (!joinResult.success) {
          return NextResponse.json(
            { success: false, error: joinResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: joinResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "update_taste": {
        if (!playerId || !Array.isArray(body.favoriteArtists)) {
          return NextResponse.json(
            { success: false, error: "Datos incompletos", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const tasteResult = await updatePlayerTaste(code, playerId, body.favoriteArtists);
        if (!tasteResult.success) {
          return NextResponse.json(
            { success: false, error: tasteResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: tasteResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "inject_spotify_tracks": {
        if (!playerId || !Array.isArray(body.tracks)) {
          return NextResponse.json(
            { success: false, error: "Datos incompletos para inyección de canciones", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const injectResult = await injectSpotifyTracksToRoom(code, playerId, body.tracks, body.artists, body.label, body.modeName);
        if (!injectResult.success) {
          return NextResponse.json(
            { success: false, error: injectResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: injectResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "propose_theme": {
        if (!playerId || !body.label) {
          return NextResponse.json(
            { success: false, error: "Tema no especificado", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const propResult = await proposeTheme(code, playerId, body.label);
        if (!propResult.success) {
          return NextResponse.json(
            { success: false, error: propResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: propResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "vote_theme": {
        if (!playerId || !body.proposalId) {
          return NextResponse.json(
            { success: false, error: "Propuesta no especificada", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const voteResult = await voteTheme(code, playerId, body.proposalId);
        if (!voteResult.success) {
          return NextResponse.json(
            { success: false, error: voteResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: voteResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "leave_room": {
        if (!playerId) {
          return NextResponse.json(
            { success: false, error: "playerId requerido", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const leaveResult = await leaveRoom(code, playerId);
        return NextResponse.json(
          { success: true, room: leaveResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "cast_vote": {
        const themeId = body.themeId;
        if (!playerId || !themeId) {
          return NextResponse.json(
            { success: false, error: "Datos de voto no válidos", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }

        const voteResult = await castVote(code, playerId, themeId);
        return NextResponse.json(
          { success: true, room: voteResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "change_settings": {
        const settingsResult = await changeRoomSettings(code, playerId, {
          gameMode: body.gameMode,
          guessType: body.guessType,
          totalRounds: body.totalRounds,
          name: body.name,
          blindMode: body.blindMode,
        });
        if (!settingsResult.success) {
          return NextResponse.json(
            { success: false, error: settingsResult.error || "No autorizado o sala no válida", serverTime: Date.now() },
            { status: 403, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: settingsResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "start_game": {
        const startResult = await startRoomGame(code, playerId);
        if (!startResult.success) {
          return NextResponse.json(
            { success: false, error: startResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: startResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "submit_answer": {
        if (typeof body.optionIndex !== "number" || !playerId) {
          return NextResponse.json(
            { success: false, error: "Respuesta no válida", serverTime: Date.now() },
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
        return NextResponse.json(
          {
            success: ansResult.success,
            pointsEarned: ansResult.pointsEarned,
            isCorrect: ansResult.isCorrect,
            room: ansResult.room,
            serverTime: Date.now(),
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "next_round": {
        const expectedRoundIndex = typeof body.expectedRoundIndex === "number" ? body.expectedRoundIndex : 1;
        const advanceResult = await advanceRoomRound(code, playerId || "", expectedRoundIndex);
        return NextResponse.json(
          { success: advanceResult.success, room: advanceResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "kick_player": {
        if (!playerId || !body.targetPlayerId) {
          return NextResponse.json(
            { success: false, error: "Datos de expulsión incompletos", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const kickResult = await kickPlayer(code, playerId, body.targetPlayerId);
        if (!kickResult.success) {
          return NextResponse.json(
            { success: false, error: kickResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: kickResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "transfer_host": {
        if (!playerId || !body.targetPlayerId) {
          return NextResponse.json(
            { success: false, error: "Datos de transferencia incompletos", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const transferResult = await transferHost(code, playerId, body.targetPlayerId);
        if (!transferResult.success) {
          return NextResponse.json(
            { success: false, error: transferResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: transferResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "rename_player": {
        if (!playerId || !body.name) {
          return NextResponse.json(
            { success: false, error: "Nombre no especificado", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const renameResult = await renamePlayer(code, playerId, body.name);
        if (!renameResult.success) {
          return NextResponse.json(
            { success: false, error: renameResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: renameResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "update_player_profile": {
        if (!playerId) {
          return NextResponse.json(
            { success: false, error: "Player ID requerido", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const updateResult = await updatePlayerProfile(code, playerId, {
          name: typeof body.name === "string" ? body.name : undefined,
          avatarColor: typeof body.avatarColor === "string" ? body.avatarColor : undefined,
          avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : undefined,
          rankTier: typeof body.rankTier === "string" ? body.rankTier : undefined,
          equippedTitle: typeof body.equippedTitle === "string" ? body.equippedTitle : undefined,
        });
        if (!updateResult.success) {
          return NextResponse.json(
            { success: false, error: updateResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: updateResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "add_playlist": {
        if (!playerId || !body.playlist) {
          return NextResponse.json(
            { success: false, error: "Datos de playlist incompletos", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const addResult = await addPlaylistToRoom(code, playerId, body.playlist);
        if (!addResult.success) {
          return NextResponse.json(
            { success: false, error: addResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: addResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "remove_playlist": {
        if (!playerId || !body.playlistId) {
          return NextResponse.json(
            { success: false, error: "ID de playlist no especificado", serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        const removeResult = await removePlaylistFromRoom(code, playerId, body.playlistId);
        if (!removeResult.success) {
          return NextResponse.json(
            { success: false, error: removeResult.error, serverTime: Date.now() },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: removeResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "rematch": {
        const rematchResult = await rematchRoomGame(code, playerId);
        if (!rematchResult.success) {
          return NextResponse.json(
            { success: false, error: rematchResult.error || "No autorizado o error al reiniciar la partida.", serverTime: Date.now() },
            { status: rematchResult.error?.includes("anfitrión") ? 403 : 400, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: rematchResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      case "reset_room":
      case "reset_to_lobby": {
        const resetResult = await resetRoomToLobby(code, playerId);
        if (!resetResult.success) {
          return NextResponse.json(
            { success: false, error: resetResult.error || "Solo el anfitrión puede reiniciar la sala.", serverTime: Date.now() },
            { status: 403, headers: NO_CACHE_HEADERS }
          );
        }
        return NextResponse.json(
          { success: true, room: resetResult.room, serverTime: Date.now() },
          { headers: NO_CACHE_HEADERS }
        );
      }

      default:
        return NextResponse.json(
          { success: false, error: "Acción no reconocida", serverTime: Date.now() },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
    }
  } catch (error: any) {
    console.error("Room action error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error procesando acción", serverTime: Date.now() },
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
        { success: true, room: leaveResult.room, serverTime: Date.now() },
        { headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: "Acción POST no reconocida", serverTime: Date.now() },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("Room POST action error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error procesando acción", serverTime: Date.now() },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
