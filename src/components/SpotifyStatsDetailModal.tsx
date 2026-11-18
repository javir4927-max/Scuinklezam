"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Flame,
  Clock,
  Sparkles,
  Play,
  Pause,
  ExternalLink,
  Loader2,
  BarChart3,
  Volume2,
} from "lucide-react";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";
import { getEffectiveVolume } from "@/lib/globalVolume";

interface ArtistStatItem {
  id: string;
  rank: number;
  name: string;
  genres: string[];
  imageUrl: string;
  spotifyUrl: string;
}

interface SpotifyStatsDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userDisplayName?: string;
}

export default function SpotifyStatsDetailModal({
  isOpen,
  onClose,
  userDisplayName,
}: SpotifyStatsDetailModalProps) {
  const [mounted, setMounted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"top_tracks" | "recently_played" | "top_artists">("top_tracks");

  useEffect(() => {
    setMounted(true);
  }, []);
  const [timeRange, setTimeRange] = useState<"long_term" | "medium_term" | "short_term">("long_term");

  const [tracks, setTracks] = useState<SpotifyTrackItem[]>([]);
  const [artists, setArtists] = useState<ArtistStatItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Audio preview state
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cache to avoid refetching already viewed tabs
  const cacheRef = useRef<Record<string, any>>({});

  // Stop audio on unmount or close
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingTrackId(null);
  };

  useEffect(() => {
    if (!isOpen) {
      stopAudio();
    }
  }, [isOpen]);

  // Synchronize audio element volume with global volume changes
  useEffect(() => {
    const handleVolume = (e: any) => {
      if (audioRef.current && e?.detail) {
        audioRef.current.volume = Math.max(0, Math.min(1, e.detail.volume));
      }
    };
    window.addEventListener("scuinklezam_volume_change", handleVolume);
    return () => window.removeEventListener("scuinklezam_volume_change", handleVolume);
  }, []);

  // Fetch stats when tab or range changes
  useEffect(() => {
    if (!isOpen) return;

    const cacheKey = `${activeTab}_${activeTab === "recently_played" ? "all" : timeRange}`;
    if (cacheRef.current[cacheKey]) {
      if (activeTab === "top_artists") {
        setArtists(cacheRef.current[cacheKey]);
      } else {
        setTracks(cacheRef.current[cacheKey]);
      }
      setIsLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    stopAudio();

    const url = `/api/spotify/stats?tab=${activeTab}&range=${timeRange}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.items) {
          cacheRef.current[cacheKey] = data.items;
          if (activeTab === "top_artists") {
            setArtists(data.items);
          } else {
            setTracks(data.items);
          }
        } else {
          setError(data.error || "No se pudieron cargar los datos.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error fetching Spotify detail stats:", err);
        setError("Error de conexión al obtener tus estadísticas.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, timeRange]);

  const handleTogglePlay = (track: SpotifyTrackItem) => {
    if (!track.previewUrl) return;

    if (playingTrackId === track.id) {
      stopAudio();
      return;
    }

    stopAudio();

    try {
      const audio = new Audio(track.previewUrl);
      audio.volume = getEffectiveVolume();
      audio.onended = () => {
        setPlayingTrackId(null);
      };
      audio.onerror = () => {
        setPlayingTrackId(null);
      };
      audio.play().catch((err) => {
        console.warn("Could not play audio snippet:", err);
        setPlayingTrackId(null);
      });
      audioRef.current = audio;
      setPlayingTrackId(track.id);
    } catch (e) {
      console.warn("Audio element error:", e);
      setPlayingTrackId(null);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-h-[92dvh] sm:max-w-3xl sm:max-h-[86vh] bg-zinc-950 border-t sm:border border-emerald-500/25 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white font-sans">
        
        {/* Header */}
        <div className="sticky top-0 z-10 p-3.5 sm:p-5 border-b border-white/10 shrink-0 bg-zinc-950/95 backdrop-blur-md space-y-2">
          {/* Drag indicator pill for mobile bottom sheet */}
          <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto sm:hidden mb-1" />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-goblinLime shrink-0">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-1.5 truncate">
                  <span className="truncate">Tus Estadísticas en Detalle</span>
                  {userDisplayName && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 shrink-0">
                      {userDisplayName}
                    </span>
                  )}
                </h2>
                <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
                  Historial y rankings sincronizados directamente con Spotify
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                stopAudio();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation & Time Filters */}
        <div className="px-3.5 sm:px-6 pt-2.5 pb-2 border-b border-white/5 bg-[#09130D] shrink-0 space-y-2">
          {/* Tabs row with horizontal scroll and no scrollbar */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setActiveTab("top_tracks")}
              className={`shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                activeTab === "top_tracks"
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                  : "bg-white/5 hover:bg-white/10 text-zinc-300"
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Top 50 Más Escuchadas</span>
            </button>

            <button
              onClick={() => setActiveTab("recently_played")}
              className={`shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                activeTab === "recently_played"
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                  : "bg-white/5 hover:bg-white/10 text-zinc-300"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Últimas 50 Recientes</span>
            </button>

            <button
              onClick={() => setActiveTab("top_artists")}
              className={`shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                activeTab === "top_artists"
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                  : "bg-white/5 hover:bg-white/10 text-zinc-300"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Top Artistas</span>
            </button>
          </div>

          {/* Time range selector (Only for Top Tracks and Top Artists) */}
          {activeTab !== "recently_played" && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[11px] font-medium text-zinc-400">
              <span className="text-[10px] uppercase font-bold text-zinc-500 mr-1 shrink-0">Periodo:</span>
              <button
                onClick={() => setTimeRange("long_term")}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs transition ${
                  timeRange === "long_term"
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold"
                    : "bg-black/20 hover:bg-white/5 text-zinc-400 border border-white/5"
                }`}
              >
                Historia
              </button>
              <button
                onClick={() => setTimeRange("medium_term")}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs transition ${
                  timeRange === "medium_term"
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold"
                    : "bg-black/20 hover:bg-white/5 text-zinc-400 border border-white/5"
                }`}
              >
                6 meses
              </button>
              <button
                onClick={() => setTimeRange("short_term")}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs transition ${
                  timeRange === "short_term"
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold"
                    : "bg-black/20 hover:bg-white/5 text-zinc-400 border border-white/5"
                }`}
              >
                4 semanas
              </button>
            </div>
          )}
        </div>

        {/* Content List Area: Real Flex-1 with min-h-0 and internal scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 py-4 pb-10 space-y-2.5">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
              <div className="text-sm font-bold text-zinc-200">Consultando tus estadísticas con Spotify...</div>
              <div className="text-xs text-zinc-500">Obteniendo carátulas originales y snippets de audio en alta fidelidad</div>
            </div>
          ) : error ? (
            <div className="py-16 text-center space-y-2">
              <div className="text-rose-400 font-bold text-sm">{error}</div>
              <div className="text-zinc-500 text-xs">Asegúrate de tener la sesión iniciada en Spotify.</div>
            </div>
          ) : activeTab === "top_artists" ? (
            /* ========================================================
               TAB 3: TOP ARTISTS LIST (#1 - #50)
               ======================================================== */
            artists.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 text-sm">
                No se encontraron artistas en este periodo de tu cuenta.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {artists.map((artist) => (
                  <div
                    key={artist.id || artist.rank}
                    className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-emerald-500/30 transition flex items-center justify-between gap-2.5 w-full min-w-0 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Rank badge */}
                      <span
                        className={`w-5 text-center font-black text-xs shrink-0 ${
                          artist.rank === 1
                            ? "text-amber-400 font-extrabold"
                            : artist.rank === 2
                            ? "text-slate-300"
                            : artist.rank === 3
                            ? "text-amber-600"
                            : "text-zinc-500"
                        }`}
                      >
                        #{artist.rank}
                      </span>

                      {/* Artist Photo */}
                      {artist.imageUrl ? (
                        <img
                          src={artist.imageUrl}
                          alt={artist.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-emerald-500/30"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center font-bold text-xs text-goblinLime shrink-0">
                          {artist.name.substring(0, 2)}
                        </div>
                      )}

                      {/* Artist Name & Genres */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs sm:text-sm text-white group-hover:text-goblinLime transition truncate">
                          {artist.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {artist.genres.slice(0, 2).join(", ") || "Artista musical"}
                        </div>
                      </div>
                    </div>

                    {/* Open on Spotify */}
                    {artist.spotifyUrl && (
                      <a
                        href={artist.spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center shrink-0 transition"
                        title="Ver en Spotify"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ========================================================
               TABS 1 & 2: TOP TRACKS & RECENTLY PLAYED (#1 - #50)
               ======================================================== */
            tracks.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 text-sm">
                No hay suficientes canciones registradas en este periodo de tu cuenta.
              </div>
            ) : (
              <div className="space-y-1.5">
                {tracks.map((track, idx) => {
                  const rank = idx + 1;
                  const isPlaying = playingTrackId === track.id;

                  return (
                    <div
                      key={track.id || idx}
                      className={`flex items-center gap-2.5 w-full min-w-0 p-2 rounded-xl border transition group ${
                        isPlaying
                          ? "bg-emerald-950/70 border-emerald-500/50 shadow-md shadow-emerald-950/50"
                          : "bg-white/[0.02] hover:bg-white/[0.05] border-white/5 hover:border-emerald-500/25"
                      }`}
                    >
                      {/* Position Rank */}
                      <span
                        className={`w-5 text-center font-mono font-black text-xs shrink-0 ${
                          rank === 1
                            ? "text-amber-400 font-extrabold text-sm"
                            : rank === 2
                            ? "text-slate-300 font-bold"
                            : rank === 3
                            ? "text-amber-600 font-bold"
                            : "text-zinc-500"
                        }`}
                      >
                        #{rank}
                      </span>

                      {/* Original Artwork Thumbnail */}
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10 group-hover:border-emerald-500/40 transition">
                        <img
                          src={track.artworkUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
                              track.title
                            )}&backgroundColor=0B1710`;
                          }}
                        />
                        {isPlaying && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Volume2 className="w-4 h-4 text-goblinLime animate-pulse" />
                          </div>
                        )}
                      </div>

                      {/* Title and Artist */}
                      <div className="flex-1 min-w-0">
                        <div
                          className={`font-bold text-xs truncate transition ${
                            isPlaying ? "text-goblinLime" : "text-white group-hover:text-emerald-300"
                          }`}
                        >
                          {track.title}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">{track.artist}</div>
                      </div>

                      {/* Actions: Audio Preview Button & External Spotify Link */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {track.previewUrl ? (
                          <button
                            onClick={() => handleTogglePlay(track)}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 ${
                              isPlaying
                                ? "bg-emerald-500 text-black font-bold shadow-lg shadow-emerald-500/30"
                                : "bg-white/5 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-300 border border-white/10"
                            }`}
                            title={isPlaying ? "Pausar previa" : "Escuchar 30s de previa"}
                          >
                            {isPlaying ? (
                              <Pause className="w-4 h-4 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                          </button>
                        ) : (
                          <span className="text-[9px] text-zinc-600 px-1">Sin audio</span>
                        )}

                        {track.spotifyUrl && (
                          <a
                            href={track.spotifyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition shrink-0"
                            title="Abrir en Spotify"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Footer info note */}
        <div className="p-3 bg-[#060D09] border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
          <span>Total: {activeTab === "top_artists" ? artists.length : tracks.length} elementos indexados</span>
          <span className="text-emerald-500/80 font-medium">Scuinklezam × Spotify API</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
