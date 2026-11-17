"use client";

import React, { useState, useEffect } from "react";
import { Flame, Trophy, Clock, FolderHeart, Link2, AlertTriangle, Gamepad2, FlaskConical, Settings, Heart, Sparkles, Loader2, Check } from "lucide-react";
import { SpotifyTrackItem, SpotifyPlaylistItem } from "@/lib/spotifyTypes";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";

interface SpotifyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayPlaylist?: (tracks: SpotifyTrackItem[], playlistName: string, artists?: string[]) => void;
  onInjectTracks?: (tracks: SpotifyTrackItem[], label: string, artists?: string[]) => void;
}

export default function SpotifyConnectModal({
  isOpen,
  onClose,
  onPlayPlaylist,
  onInjectTracks,
}: SpotifyConnectModalProps) {
  const { isConnected, user, stats, playlists, isLoading, logout } = useSpotifyAuth();

  // Public playlist import state
  const [urlInput, setUrlInput] = useState<string>("");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedData, setImportedData] = useState<{
    name: string;
    tracks: SpotifyTrackItem[];
  } | null>(null);

  // Private playlists selector state
  const [showPlaylistsDrawer, setShowPlaylistsDrawer] = useState<boolean>(false);
  const [selectedPlaylistLoading, setSelectedPlaylistLoading] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);

  // Developer API keys configuration state
  const [showConfigKeys, setShowConfigKeys] = useState<boolean>(false);
  const [clientIdInput, setClientIdInput] = useState<string>("");
  const [clientSecretInput, setClientSecretInput] = useState<string>("");
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/spotify/config")
        .then((res) => res.json())
        .then((data) => {
          if (data.configured) setIsConfigured(true);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handler for Public Playlist Import
  const handleImportUrl = async () => {
    if (!urlInput.trim()) return;
    setIsImporting(true);
    setImportError(null);
    setImportedData(null);

    try {
      const res = await fetch("/api/spotify/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (data.success && data.tracks && data.tracks.length > 0) {
        setImportedData({
          name: data.name,
          tracks: data.tracks,
        });
      } else {
        setImportError(data.error || "No se pudieron obtener canciones válidas de este enlace.");
      }
    } catch {
      setImportError("Error de conexión al importar la playlist.");
    } finally {
      setIsImporting(false);
    }
  };

  // Handler for importing a private playlist chosen from user's playlists
  const handleSelectPrivatePlaylist = async (pl: SpotifyPlaylistItem) => {
    setSelectedPlaylistLoading(pl.id);
    try {
      const res = await fetch("/api/spotify/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://open.spotify.com/playlist/${pl.id}` }),
      });
      const data = await res.json();
      if (data.success && data.tracks && data.tracks.length > 0) {
        if (onInjectTracks) {
          onInjectTracks(data.tracks, pl.name);
        } else if (onPlayPlaylist) {
          onPlayPlaylist(data.tracks, pl.name);
        }
        onClose();
      } else {
        alert(data.error || "No se pudieron extraer canciones de esta playlist.");
      }
    } catch {
      alert("Error cargando la playlist seleccionada.");
    } finally {
      setSelectedPlaylistLoading(null);
    }
  };

  // Handler for 1-click mixing from real Spotify endpoints (with 401 refresh & iTunes audio enrichment)
  const handleSelectMode = async (
    mode: "recently_played" | "top_tracks" | "top_artists" | "liked_songs"
  ) => {
    setLoadingMode(mode);
    setModeNotice(null);
    try {
      const res = await fetch("/api/spotify/user-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!data.success || !data.tracks || data.tracks.length === 0) {
        setModeNotice(
          data.warning || data.error || `0 canciones encontradas en el modo seleccionado.`
        );
        return;
      }

      if (onInjectTracks) {
        onInjectTracks(data.tracks, data.modeName, data.artists);
      } else if (onPlayPlaylist) {
        onPlayPlaylist(data.tracks, data.modeName, data.artists);
      }
      onClose();
    } catch {
      setModeNotice("Error de conexión al obtener canciones de Spotify.");
    } finally {
      setLoadingMode(null);
    }
  };

  // Handler for 1-click mixing from stats (fallback)
  const handleInjectQuickStats = (
    tracks: SpotifyTrackItem[],
    label: string,
    artists?: string[]
  ) => {
    if (!tracks || tracks.length === 0) {
      alert("Aún no hay suficientes canciones registradas en este periodo de tu cuenta.");
      return;
    }
    if (onInjectTracks) {
      onInjectTracks(tracks, label, artists);
    } else if (onPlayPlaylist) {
      onPlayPlaylist(tracks, label, artists);
    }
    onClose();
  };

  // Save developer keys
  const handleSaveConfig = async () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim()) return;
    setIsSavingConfig(true);
    setConfigSuccess(null);

    try {
      const res = await fetch("/api/spotify/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientIdInput.trim(),
          clientSecret: clientSecretInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsConfigured(true);
        setConfigSuccess("¡Claves guardadas con éxito!");
      } else {
        setImportError(data.error || "Error guardando claves");
      }
    } catch {
      setImportError("Error de conexión al guardar claves");
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0B1710] border border-emerald-500/30 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white font-bold text-lg cursor-pointer transition"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#1DB954] flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <svg className="w-6 h-6 text-black fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          </div>
          <div>
            <h2 className="font-display font-black text-xl text-white">
              Spotify en Scuinklezam
            </h2>
            <p className="text-xs text-zinc-400">
              Analiza tus gustos reales o importa cualquier playlist para jugar con amigos.
            </p>
          </div>
        </div>

        {/* ========================================================
            1. ARRIBA DE TODO: CUENTA Y ESTADÍSTICAS SPOTIFY
           ======================================================== */}
        {!isConnected ? (
          /* NOT CONNECTED STATE: Prominent Card with Green Border */
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#102218] to-black/80 border-2 border-[#1DB954]/50 shadow-xl shadow-[#1DB954]/10 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/40 text-[#1DB954]">
                  RECOMENDADO · TASTE BLENDER
                </span>
                <h3 className="font-display font-extrabold text-base text-white">
                  Conecta tu Cuenta de Spotify
                </h3>
              </div>
              <Flame className="w-6 h-6 text-emerald-400" />
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Inicia sesión con tu cuenta oficial para que Scuinklezam analice tus
              <strong> canciones más escuchadas</strong>, tus <strong>artistas top</strong> y tus
              <strong> playlists privadas</strong>, generando partidas personalizadas al instante.
            </p>

            <a
              href="/api/auth/spotify/login"
              className="w-full py-3.5 px-4 rounded-2xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-black text-sm text-center flex items-center justify-center gap-2.5 shadow-lg shadow-[#1DB954]/25 transition cursor-pointer"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              <span>Iniciar sesión con Spotify</span>
            </a>
          </div>
        ) : (
          /* CONNECTED STATE: Real User Stats & 4 Quick Actions */
          <div className="p-5 rounded-3xl bg-gradient-to-br from-[#102218] to-black/70 border border-[#1DB954]/40 space-y-5">
            {/* User Session Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.displayName}
                    className="w-10 h-10 rounded-full object-cover border border-[#1DB954]"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#1DB954] text-black font-black flex items-center justify-center text-sm">
                    {user?.displayName?.substring(0, 2).toUpperCase() || "SP"}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse" />
                    <span className="text-xs font-bold text-white">
                      {user?.displayName}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] font-bold">
                      Conectado
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Estadísticas analizadas y sincronizadas
                  </div>
                </div>
              </div>

              <button
                onClick={() => logout()}
                className="text-xs text-zinc-400 hover:text-red-400 font-semibold transition"
              >
                Cerrar sesión
              </button>
            </div>

            {/* Top 5 Artists Carousel / Avatars */}
            {stats && stats.topArtists && stats.topArtists.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Tus Artistas Más Escuchados</span>
                  <span className="text-[10px] text-zinc-400 lowercase">análisis oficial</span>
                </div>
                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  {stats.topArtists.slice(0, 5).map((artist, idx) => (
                    <div
                      key={artist.id || idx}
                      className="flex flex-col items-center gap-1.5 shrink-0 w-16 text-center"
                    >
                      {artist.imageUrl ? (
                        <img
                          src={artist.imageUrl}
                          alt={artist.name}
                          className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/40"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center font-bold text-xs text-goblinLime">
                          {artist.name.substring(0, 2)}
                        </div>
                      )}
                      <span className="text-[10px] font-bold text-zinc-300 truncate w-full">
                        {artist.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4 Real Spotify Modes */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-bold text-zinc-300">
                Selecciona un modo de juego con tu cuenta de Spotify:
              </div>

              {modeNotice && (
                <div className="p-2.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{modeNotice}</span>
                  </div>
                  <button
                    onClick={() => setModeNotice(null)}
                    className="text-zinc-400 hover:text-white p-0.5"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 1. Escuchadas Recientemente */}
                <button
                  disabled={loadingMode !== null}
                  onClick={() => handleSelectMode("recently_played")}
                  className="p-3 rounded-2xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/25 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMode === "recently_played" ? (
                    <Loader2 className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
                  ) : (
                    <Clock className="w-5 h-5 text-cyan-400 shrink-0" />
                  )}
                  <div className="flex-1 truncate">
                    <div className="font-bold text-xs text-white group-hover:text-goblinLime transition truncate">
                      Escuchadas Recientemente
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      Tus últimas 50 canciones reproducidas
                    </div>
                  </div>
                </button>

                {/* 2. Más Escuchadas */}
                <button
                  disabled={loadingMode !== null}
                  onClick={() => handleSelectMode("top_tracks")}
                  className="p-3 rounded-2xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/25 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMode === "top_tracks" ? (
                    <Loader2 className="w-5 h-5 text-amber-300 animate-spin shrink-0" />
                  ) : (
                    <Trophy className="w-5 h-5 text-amber-300 shrink-0" />
                  )}
                  <div className="flex-1 truncate">
                    <div className="font-bold text-xs text-white group-hover:text-goblinLime transition truncate">
                      Más Escuchadas
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      Top hits de tu cuenta de Spotify
                    </div>
                  </div>
                </button>

                {/* 3. Tus Artistas Favoritos */}
                <button
                  disabled={loadingMode !== null}
                  onClick={() => handleSelectMode("top_artists")}
                  className="p-3 rounded-2xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/25 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMode === "top_artists" ? (
                    <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  <div className="flex-1 truncate">
                    <div className="font-bold text-xs text-white group-hover:text-goblinLime transition truncate">
                      Tus Artistas Favoritos
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      Temas de tus top 10 artistas
                    </div>
                  </div>
                </button>

                {/* 4. Canciones Que Te Gustan */}
                <button
                  disabled={loadingMode !== null}
                  onClick={() => handleSelectMode("liked_songs")}
                  className="p-3 rounded-2xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/25 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMode === "liked_songs" ? (
                    <Loader2 className="w-5 h-5 text-pink-400 animate-spin shrink-0" />
                  ) : (
                    <Heart className="w-5 h-5 text-pink-400 shrink-0" />
                  )}
                  <div className="flex-1 truncate">
                    <div className="font-bold text-xs text-white group-hover:text-goblinLime transition truncate">
                      Canciones Que Te Gustan
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      Tus canciones guardadas en biblioteca
                    </div>
                  </div>
                </button>

                {/* 5. Elegir Playlist Privada */}
                <button
                  onClick={() => setShowPlaylistsDrawer(!showPlaylistsDrawer)}
                  className="p-3 rounded-2xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/25 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group sm:col-span-2"
                >
                  <FolderHeart className="w-5 h-5 text-goblinLime shrink-0" />
                  <div className="flex-1 truncate">
                    <div className="font-bold text-xs text-white group-hover:text-goblinLime transition truncate">
                      Elegir de Mis Playlists Privadas
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {playlists.length} playlists detectadas en tu biblioteca
                    </div>
                  </div>
                </button>
              </div>

              {/* Private Playlists Dropdown/Drawer */}
              {showPlaylistsDrawer && (
                <div className="mt-3 p-3 rounded-2xl bg-black/60 border border-emerald-500/20 max-h-48 overflow-y-auto space-y-1.5">
                  <div className="text-[11px] font-bold text-emerald-400 uppercase pb-1">
                    Selecciona una de tus playlists:
                  </div>
                  {playlists.length === 0 ? (
                    <div className="text-xs text-zinc-400">No se encontraron playlists públicas/privadas.</div>
                  ) : (
                    playlists.map((pl) => (
                      <div
                        key={pl.id}
                        onClick={() => handleSelectPrivatePlaylist(pl)}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-emerald-950/50 cursor-pointer transition text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {pl.imageUrl ? (
                            <img src={pl.imageUrl} alt={pl.name} className="w-7 h-7 rounded-lg object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-emerald-900/60 flex items-center justify-center font-bold text-[10px]">
                              PL
                            </div>
                          )}
                          <span className="font-bold text-white truncate">{pl.name}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          {selectedPlaylistLoading === pl.id ? "Cargando..." : `${pl.tracksTotal} temas`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            2. SEPARADOR VISUAL OBLIGATORIO
           ======================================================== */}
        <div className="relative py-2 flex items-center justify-center text-xs text-zinc-400 font-bold uppercase tracking-wider">
          <div className="w-full border-t border-emerald-500/15 absolute" />
          <span className="relative bg-[#0B1710] px-4">
            — O si prefieres jugar sin iniciar sesión —
          </span>
        </div>

        {/* ========================================================
            3. ABAJO: CONTENEDOR DISCRETO (PEGA ENLACE PÚBLICO)
           ======================================================== */}
        <div className="bg-[#102218]/60 p-4 rounded-2xl border border-emerald-500/15 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Usar una playlist sin iniciar sesión</span>
            </label>
            <span className="text-[10px] text-zinc-400">Enlace público de Spotify</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImportUrl()}
              placeholder="https://open.spotify.com/playlist/..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/30 text-white text-xs font-mono focus:outline-none focus:border-goblinLime"
            />
            <button
              onClick={handleImportUrl}
              disabled={isImporting || !urlInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs hover:opacity-95 transition cursor-pointer disabled:opacity-50"
            >
              {isImporting ? "Cargando..." : "Importar"}
            </button>
          </div>

          {importError && (
            <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {importedData && (
            <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-goblinLime/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white truncate max-w-[280px]">
                  ✓ {importedData.name} ({importedData.tracks.length} canciones)
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                {onPlayPlaylist && (
                  <button
                    onClick={() => {
                      onPlayPlaylist(importedData.tracks, importedData.name);
                      onClose();
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs hover:opacity-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Gamepad2 className="w-3.5 h-3.5" />
                    <span>Jugar Solo</span>
                  </button>
                )}
                {onInjectTracks ? (
                  <button
                    onClick={() => {
                      onInjectTracks(importedData.tracks, importedData.name);
                      onClose();
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-extrabold text-xs border border-emerald-500/30 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Añadir a Sala</span>
                  </button>
                ) : (
                  <a
                    href={`/play?customPlaylist=${encodeURIComponent(importedData.name)}`}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.setItem("scuinklezam_custom_tracks", JSON.stringify(importedData.tracks));
                      }
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-extrabold text-xs text-center border border-emerald-500/30 transition flex items-center justify-center gap-1.5"
                  >
                    <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Usar en Sala</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Developer API Keys Section */}
        <div className="border border-emerald-500/15 rounded-2xl p-3 bg-black/30 space-y-2">
          <button
            onClick={() => setShowConfigKeys(!showConfigKeys)}
            className="w-full flex items-center justify-between text-left text-[11px] font-bold text-zinc-400 hover:text-white cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-zinc-400" />
              <span>Ajustes avanzados para desarrolladores (Client ID & Secret)</span>
              {isConfigured && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-goblinLime">
                  Configurado
                </span>
              )}
            </div>
            <span>{showConfigKeys ? "▲" : "▼"}</span>
          </button>

          {showConfigKeys && (
            <div className="pt-2 space-y-2.5 text-xs">
              <p className="text-zinc-400 text-[11px]">
                Configura tus credenciales de Spotify Developer. Redirect URI requerida:{" "}
                <code className="text-goblinLime">http://127.0.0.1:3000/api/auth/spotify/callback</code>
              </p>
              <input
                type="text"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                placeholder="Client ID"
                className="w-full px-3 py-1.5 rounded-xl bg-black/60 border border-emerald-500/30 text-white font-mono text-xs focus:outline-none"
              />
              <input
                type="password"
                value={clientSecretInput}
                onChange={(e) => setClientSecretInput(e.target.value)}
                placeholder="Client Secret"
                className="w-full px-3 py-1.5 rounded-xl bg-black/60 border border-emerald-500/30 text-white font-mono text-xs focus:outline-none"
              />
              {configSuccess && (
                <div className="text-goblinLime font-bold text-xs">{configSuccess}</div>
              )}
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="w-full py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs transition cursor-pointer disabled:opacity-50"
              >
                {isSavingConfig ? "Guardando..." : "Guardar Claves"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
