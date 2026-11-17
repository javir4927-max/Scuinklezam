"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Flame,
  Clock,
  Sparkles,
  Play,
  Pause,
  Crown,
  BarChart3,
  ExternalLink,
  Loader2,
  Calendar,
  Disc3,
  Dna,
  CheckCircle2,
  Volume2,
} from "lucide-react";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import { getEffectiveVolume } from "@/lib/globalVolume";
import SpotifyStatsDetailModal from "@/components/SpotifyStatsDetailModal";

interface ArtistStatItem {
  id: string;
  rank: number;
  name: string;
  genres: string[];
  imageUrl: string;
  spotifyUrl: string;
}

interface SpotifyStatsWrappedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TimeRangeKey = "recent" | "short_term" | "medium_term" | "long_term";

export default function SpotifyStatsWrappedModal({
  isOpen,
  onClose,
}: SpotifyStatsWrappedModalProps) {
  const { isConnected, user } = useSpotifyAuth();
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("short_term");

  const [tracks, setTracks] = useState<SpotifyTrackItem[]>([]);
  const [artists, setArtists] = useState<ArtistStatItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Audio preview playback
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Detail Modal (#1 to #50)
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  // In-memory cache by range key
  const cacheRef = useRef<
    Record<string, { tracks: SpotifyTrackItem[]; artists: ArtistStatItem[] }>
  >({});

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

  // Fetch data for the active time range
  useEffect(() => {
    if (!isOpen || !isConnected) return;

    if (cacheRef.current[timeRange]) {
      setTracks(cacheRef.current[timeRange].tracks);
      setArtists(cacheRef.current[timeRange].artists);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    stopAudio();

    const fetchTracksUrl =
      timeRange === "recent"
        ? `/api/spotify/stats?tab=recently_played`
        : `/api/spotify/stats?tab=top_tracks&range=${timeRange}`;

    const fetchArtistsRange = timeRange === "recent" ? "short_term" : timeRange;
    const fetchArtistsUrl = `/api/spotify/stats?tab=top_artists&range=${fetchArtistsRange}`;

    Promise.all([
      fetch(fetchTracksUrl).then((r) => r.json()),
      fetch(fetchArtistsUrl).then((r) => r.json()),
    ])
      .then(([tracksRes, artistsRes]) => {
        if (!isMounted) return;

        const loadedTracks: SpotifyTrackItem[] =
          tracksRes.success && Array.isArray(tracksRes.items) ? tracksRes.items : [];
        const loadedArtists: ArtistStatItem[] =
          artistsRes.success && Array.isArray(artistsRes.items) ? artistsRes.items : [];

        if (loadedTracks.length === 0 && loadedArtists.length === 0) {
          setError("No encontramos suficientes datos de escucha en este periodo.");
        } else {
          cacheRef.current[timeRange] = {
            tracks: loadedTracks,
            artists: loadedArtists,
          };
          setTracks(loadedTracks);
          setArtists(loadedArtists);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error loading Wrapped stats:", err);
        setError("Error al cargar tus estadísticas de Spotify.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, isConnected, timeRange]);

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
      audio.onended = () => setPlayingTrackId(null);
      audio.onerror = () => setPlayingTrackId(null);
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

  if (!isOpen) return null;

  // Compute Hero #1 (Top Artist)
  const topArtist = artists.length > 0 ? artists[0] : null;

  // Compute how many songs in top are from topArtist
  const songsByTopArtist =
    topArtist && tracks.length > 0
      ? tracks.filter((t) =>
          t.artist.toLowerCase().includes(topArtist.name.toLowerCase())
        ).length
      : 0;

  // Compute Hero #2 (Top Track)
  const topTrack = tracks.length > 0 ? tracks[0] : null;

  // Top 5 lists
  const top5Artists = artists.slice(0, 5);
  const top5Tracks = tracks.slice(0, 5);

  // Compute Musical DNA (Top 4-5 genres)
  const genreTally: Record<string, number> = {};
  artists.forEach((a) => {
    (a.genres || []).forEach((g) => {
      const clean = g.trim().toLowerCase();
      if (clean) {
        genreTally[clean] = (genreTally[clean] || 0) + 1;
      }
    });
  });

  const sortedGenres = Object.entries(genreTally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalGenreWeight = sortedGenres.reduce((acc, curr) => acc + curr[1], 0) || 1;
  const dnaGenres = sortedGenres.map(([name, count]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    percentage: Math.min(100, Math.round((count / totalGenreWeight) * 100)),
  }));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#060D09] border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden text-white font-sans">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-emerald-500/20 bg-[#0B1710]/90 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-goblinLime shadow-md">
                <Sparkles className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-black text-lg sm:text-xl text-white tracking-tight">
                    Tu Wrapped de Spotify
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-400/40 text-[10px] font-black uppercase text-goblinLime tracking-wider">
                    En Vivo
                  </span>
                </div>
                <p className="text-xs text-zinc-400 truncate max-w-[240px] sm:max-w-md">
                  {user?.displayName ? `Perfil de ${user.displayName}` : "Resumen visual de tus gustos musicales"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Botón Ver stats a detalle en cabecera */}
              <button
                type="button"
                onClick={() => setShowDetailModal(true)}
                className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 border border-white/10 text-xs font-semibold transition cursor-pointer shadow-sm hover:border-emerald-500/40"
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ver stats a detalle</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer border border-white/10"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Time Range Pills Selector */}
          <div className="px-5 sm:px-7 py-3 border-b border-emerald-500/15 bg-black/40 flex items-center justify-between gap-3 overflow-x-auto shrink-0 scrollbar-none">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTimeRange("recent")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  timeRange === "recent"
                    ? "bg-goblinPrimary text-black shadow-md shadow-emerald-900/40 font-black"
                    : "bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/10"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Esta Semana</span>
              </button>

              <button
                type="button"
                onClick={() => setTimeRange("short_term")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  timeRange === "short_term"
                    ? "bg-goblinPrimary text-black shadow-md shadow-emerald-900/40 font-black"
                    : "bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/10"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Último Mes</span>
              </button>

              <button
                type="button"
                onClick={() => setTimeRange("medium_term")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  timeRange === "medium_term"
                    ? "bg-goblinPrimary text-black shadow-md shadow-emerald-900/40 font-black"
                    : "bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/10"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Últimos 6 Meses</span>
              </button>

              <button
                type="button"
                onClick={() => setTimeRange("long_term")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  timeRange === "long_term"
                    ? "bg-goblinPrimary text-black shadow-md shadow-emerald-900/40 font-black"
                    : "bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/10"
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Histórico (Top Anual)</span>
              </button>
            </div>

            {/* Mobile Ver stats a detalle shortcut */}
            <button
              type="button"
              onClick={() => setShowDetailModal(true)}
              className="sm:hidden text-xs font-bold text-goblinLime hover:underline flex items-center gap-1 shrink-0"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>50 Top</span>
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-7">
            {!isConnected ? (
              /* State: Not connected to Spotify */
              <div className="py-12 text-center space-y-5 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center mx-auto text-goblinLime shadow-lg">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-display font-black text-2xl text-white">
                    Conecta tu cuenta de Spotify
                  </h3>
                  <p className="text-zinc-300 text-sm leading-relaxed">
                    Accede a tu resumen estilo Spotify Wrapped con tu artista #1, canción en bucle, Top 5 y ADN musical interactivo.
                  </p>
                </div>
                <a
                  href="/api/auth/spotify/login"
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-sm transition shadow-lg shadow-emerald-900/40 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 fill-black" />
                  <span>Conectar con Spotify</span>
                </a>
              </div>
            ) : isLoading ? (
              /* State: Loading */
              <div className="py-24 text-center space-y-4">
                <Loader2 className="w-10 h-10 text-goblinLime animate-spin mx-auto" />
                <div className="text-sm font-semibold text-zinc-300">
                  Calculando tu Wrapped musical...
                </div>
                <div className="text-xs text-zinc-500">
                  Analizando reproducciones, audio previews y géneros
                </div>
              </div>
            ) : error ? (
              /* State: Error */
              <div className="p-8 text-center space-y-4 max-w-md mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-red-950/80 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
                  <X className="w-6 h-6" />
                </div>
                <div className="text-sm text-zinc-300">{error}</div>
                <button
                  type="button"
                  onClick={() => setShowDetailModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-white hover:bg-zinc-700 transition"
                >
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <span>Abrir explorador de stats al detalle</span>
                </button>
              </div>
            ) : (
              /* State: Ready Wrapped Visual Dashboard */
              <>
                {/* 1. DOS TARJETAS HERO (TOP ARTISTA & TOP CANCIÓN) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Hero #1: Tu Artista #1 */}
                  {topArtist ? (
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/90 via-[#0B1710] to-[#060D09] border border-emerald-500/30 p-6 flex flex-col justify-between shadow-xl">
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                      <div className="flex items-center justify-between relative z-10">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-[11px] font-black uppercase text-amber-300 tracking-wider shadow-sm">
                          <Crown className="w-3.5 h-3.5 text-amber-300" />
                          <span>#1 Tu Artista Top</span>
                        </span>
                        {songsByTopArtist > 0 && (
                          <span className="text-[11px] font-bold text-zinc-400">
                            {songsByTopArtist} temas en tu top
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-5 my-5 relative z-10">
                        <div className="relative group shrink-0">
                          <img
                            src={topArtist.imageUrl}
                            alt={topArtist.name}
                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-2 border-emerald-400/40 shadow-2xl ring-4 ring-emerald-500/20 bg-emerald-950"
                          />
                          <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-goblinPrimary text-black font-black text-xs flex items-center justify-center shadow-lg border-2 border-[#0B1710]">
                            #1
                          </div>
                        </div>

                        <div className="min-w-0 space-y-1.5">
                          <h2 className="font-display font-black text-2xl sm:text-3xl text-white truncate hover:text-goblinLime transition">
                            {topArtist.name}
                          </h2>
                          {topArtist.genres && topArtist.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {topArtist.genres.slice(0, 3).map((g, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-[10px] font-bold text-emerald-300 uppercase tracking-wider"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-emerald-500/15 flex items-center justify-between text-xs text-zinc-400 relative z-10">
                        <span>Artista más escuchado del periodo</span>
                        <a
                          href={topArtist.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-white flex items-center gap-1 font-bold transition"
                        >
                          <span>Spotify</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ) : null}

                  {/* Hero #2: Tu Canción #1 en Bucle */}
                  {topTrack ? (
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/90 via-[#0B1710] to-[#060D09] border border-emerald-500/30 p-6 flex flex-col justify-between shadow-xl">
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                      <div className="flex items-center justify-between relative z-10">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-black uppercase text-goblinLime tracking-wider shadow-sm">
                          <Flame className="w-3.5 h-3.5 text-goblinLime" />
                          <span>#1 Canción en Bucle</span>
                        </span>
                        <span className="text-[11px] font-bold text-zinc-400">
                          30s Preview HD
                        </span>
                      </div>

                      <div className="flex items-center gap-5 my-5 relative z-10">
                        <div className="relative group shrink-0">
                          <img
                            src={topTrack.artworkUrl}
                            alt={topTrack.title}
                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-emerald-400/40 shadow-2xl ring-4 ring-emerald-500/20 bg-emerald-950"
                          />
                          <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-goblinPrimary text-black font-black text-xs flex items-center justify-center shadow-lg border-2 border-[#0B1710]">
                            #1
                          </div>
                        </div>

                        <div className="min-w-0 space-y-1 flex-1">
                          <h2 className="font-display font-black text-xl sm:text-2xl text-white truncate hover:text-goblinLime transition">
                            {topTrack.title}
                          </h2>
                          <p className="text-sm text-zinc-300 font-semibold truncate">
                            {topTrack.artist}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {topTrack.album}
                          </p>

                          {topTrack.previewUrl && (
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => handleTogglePlay(topTrack)}
                                className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-md ${
                                  playingTrackId === topTrack.id
                                    ? "bg-rose-500 text-white shadow-rose-900/40"
                                    : "bg-goblinPrimary text-black shadow-emerald-900/40 hover:scale-105"
                                }`}
                              >
                                {playingTrackId === topTrack.id ? (
                                  <>
                                    <Pause className="w-3.5 h-3.5 fill-current" />
                                    <span>Pausar</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>▷ Escuchar Preview</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-emerald-500/15 flex items-center justify-between text-xs text-zinc-400 relative z-10">
                        <span>Tu tema más repetido</span>
                        <a
                          href={topTrack.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-white flex items-center gap-1 font-bold transition"
                        >
                          <span>Spotify</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 2. DOS COLUMNAS TOP 5 (ARTISTAS & CANCIONES) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Columna Izquierda: Top 5 Artistas */}
                  <div className="bg-[#0B1710] border border-emerald-500/20 rounded-3xl p-5 space-y-3.5 shadow-lg">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-400" />
                        <h3 className="font-display font-black text-base text-white">
                          Tus Top 5 Artistas
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase">
                        #1 - #5
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {top5Artists.map((artist, idx) => (
                        <div
                          key={artist.id}
                          className="flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.02] hover:bg-emerald-950/40 border border-white/5 hover:border-emerald-500/30 transition group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono font-black text-xs text-goblinLime w-5 text-center shrink-0">
                              #{idx + 1}
                            </span>
                            <img
                              src={artist.imageUrl}
                              alt={artist.name}
                              className="w-10 h-10 rounded-full object-cover border border-emerald-500/30 shrink-0 bg-emerald-950"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-xs sm:text-sm text-white truncate group-hover:text-goblinLime transition">
                                {artist.name}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate">
                                {artist.genres?.slice(0, 2).join(", ") || "Artista Top"}
                              </div>
                            </div>
                          </div>

                          <a
                            href={artist.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition shrink-0"
                            title="Abrir en Spotify"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Columna Derecha: Top 5 Canciones */}
                  <div className="bg-[#0B1710] border border-emerald-500/20 rounded-3xl p-5 space-y-3.5 shadow-lg">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-goblinLime" />
                        <h3 className="font-display font-black text-base text-white">
                          Tus Top 5 Canciones
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase">
                        #1 - #5
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {top5Tracks.map((track, idx) => {
                        const isCurrentPlaying = playingTrackId === track.id;

                        return (
                          <div
                            key={track.id}
                            className="flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.02] hover:bg-emerald-950/40 border border-white/5 hover:border-emerald-500/30 transition group"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                              <span className="font-mono font-black text-xs text-goblinLime w-5 text-center shrink-0">
                                #{idx + 1}
                              </span>
                              <img
                                src={track.artworkUrl}
                                alt={track.title}
                                className="w-10 h-10 rounded-xl object-cover border border-emerald-500/30 shrink-0 bg-emerald-950"
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-xs sm:text-sm text-white truncate group-hover:text-goblinLime transition">
                                  {track.title}
                                </div>
                                <div className="text-[10px] text-zinc-400 truncate">
                                  {track.artist}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {track.previewUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleTogglePlay(track)}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                                    isCurrentPlaying
                                      ? "bg-rose-500 text-white"
                                      : "bg-emerald-950/80 hover:bg-goblinPrimary text-emerald-300 hover:text-black border border-emerald-500/40"
                                  }`}
                                  title={isCurrentPlaying ? "Pausar" : "Reproducir fragmento"}
                                >
                                  {isCurrentPlaying ? (
                                    <Pause className="w-3 h-3 fill-current" />
                                  ) : (
                                    <Play className="w-3 h-3 fill-current ml-0.5" />
                                  )}
                                </button>
                              )}

                              <a
                                href={track.spotifyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
                                title="Abrir en Spotify"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. TU ADN MUSICAL (GÉNEROS) */}
                {dnaGenres.length > 0 && (
                  <div className="bg-[#0B1710] border border-emerald-500/20 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
                      <div className="flex items-center gap-2">
                        <Dna className="w-4 h-4 text-emerald-400" />
                        <h3 className="font-display font-black text-base text-white">
                          Tu ADN Musical
                        </h3>
                      </div>
                      <span className="text-xs text-zinc-400">
                        Géneros predominantes en este periodo
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                      {dnaGenres.map((dna, idx) => (
                        <div
                          key={dna.name}
                          className="p-3.5 rounded-2xl bg-white/[0.02] border border-emerald-500/20 space-y-2 hover:border-emerald-500/40 transition"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-white truncate">{dna.name}</span>
                            <span className="font-mono font-black text-goblinLime">
                              {dna.percentage}%
                            </span>
                          </div>
                          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-lime-400 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(8, dna.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. FOOTER CALLOUT CON BOTÓN "VER STATS A DETALLE" */}
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-3 text-center sm:text-left">
                    <div className="w-9 h-9 rounded-xl bg-emerald-900/60 border border-emerald-500/40 flex items-center justify-center text-goblinLime shrink-0">
                      <BarChart3 className="w-4 h-4 text-goblinLime" />
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-white">
                        ¿Quieres ver tu ranking completo del 1 al 50?
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Explora las 50 canciones y artistas con audio preview y orden estricto
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDetailModal(true)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-goblinPrimary hover:bg-[#1ed760] text-black font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer shrink-0"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Ver stats a detalle</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sub-modal: Detailed 50 Tracks & Artists List */}
      <SpotifyStatsDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        userDisplayName={user?.displayName}
      />
    </>
  );
}
