"use client";

import React, { useState, useEffect } from "react";
import { Crown, Play, Pause, Heart } from "lucide-react";
import { playSynthNote } from "@/lib/audio";
import { spotifyPlayer } from "@/lib/spotifyPlayer";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";

interface BentoFeaturesProps {
  onOpenMiniQuiz?: (topic?: string) => void;
}

const FEATURE_TRACKS: SpotifyTrackItem[] = [
  {
    id: "6wf7Yu7cx00NeEY8WWvVJu",
    uri: "spotify:track:6wf7Yu7cx00NeEY8WWvVJu",
    title: "BAILE INoLVIDABLE",
    artist: "Bad Bunny",
    album: "nadie sabe lo que va a pasar mañana",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b2730bf7e23891ab901eb9436417",
    spotifyUrl: "https://open.spotify.com/track/6wf7Yu7cx00NeEY8WWvVJu",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/b4/07/77/b4077759-4f7f-d51a-e8d7-550be0a5a67c/mzaf_9956667958564175317.plus.aac.p.m4a",
  },
  {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    uri: "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
    spotifyUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/44/1a/0b/441a0b38-9584-7a0e-bc21-ce1ebf3ec9e5/mzaf_13506450654407883907.plus.aac.p.m4a",
  },
  {
    id: "1BxfuPKGuaTgP7aM0fbdwr",
    uri: "spotify:track:1BxfuPKGuaTgP7aM0fbdwr",
    title: "Cruel Summer",
    artist: "Taylor Swift",
    album: "Lover",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e787cffec20aa2a396a61647",
    spotifyUrl: "https://open.spotify.com/track/1BxfuPKGuaTgP7aM0fbdwr",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/7e/61/89/7e6189ef-ef31-b851-bc29-4d6d634354c4/mzaf_16377770857393437533.plus.aac.p.m4a",
  },
  {
    id: "2G7V7zsVDxg1yRsu7Ew9RJ",
    uri: "spotify:track:2G7V7zsVDxg1yRsu7Ew9RJ",
    title: "BIRDS OF A FEATHER",
    artist: "Billie Eilish",
    album: "HIT ME HARD AND SOFT",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62",
    spotifyUrl: "https://open.spotify.com/track/2G7V7zsVDxg1yRsu7Ew9RJ",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview122/v4/ce/d3/c7/ced3c76c-3721-a393-2771-a083f2e1cfeb/mzaf_13550212882582875151.plus.aac.p.m4a",
  },
  {
    id: "0ofHAoxe9vBkTCp2UQIavz",
    uri: "spotify:track:0ofHAoxe9vBkTCp2UQIavz",
    title: "Die With A Smile",
    artist: "Lady Gaga, Bruno Mars",
    album: "Die With A Smile",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b27382ea2e9e1f5829b2324a73e6",
    spotifyUrl: "https://open.spotify.com/track/0ofHAoxe9vBkTCp2UQIavz",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview112/v4/4e/c5/4d/4ec54d31-4122-c283-7c2a-fa1f9747963d/mzaf_1130638361093153545.plus.aac.p.m4a",
  },
];

export default function BentoFeatures({ onOpenMiniQuiz }: BentoFeaturesProps) {
  const { isConnected, playlists } = useSpotifyAuth();
  const [lucasScore, setLucasScore] = useState<number>(47180);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<Record<string, string>>({});

  const bumpOdometer = () => {
    setLucasScore((prev) => prev + 95);
    playSynthNote(659.25);
  };

  const handlePlaySample = async (track: SpotifyTrackItem) => {
    if (playingId === track.id) {
      spotifyPlayer.stop();
      setPlayingId(null);
      return;
    }

    setPlayingId(track.id);
    const played = await spotifyPlayer.playTrack(track);
    if (!played) {
      playSynthNote(440);
    }
  };

  const handleSaveToSpotify = async (track: SpotifyTrackItem) => {
    try {
      const res = await fetch("/api/spotify/save-track", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      const data = await res.json();
      setSavedFeedback((prev) => ({
        ...prev,
        [track.id]: data.demo ? "Guardado en favoritos" : "Guardado en Spotify",
      }));
      playSynthNote(880);
      setTimeout(() => {
        setSavedFeedback((prev) => {
          const next = { ...prev };
          delete next[track.id];
          return next;
        });
      }, 2500);
    } catch {
      setSavedFeedback((prev) => ({ ...prev, [track.id]: "Guardado" }));
    }
  };

  return (
    <section id="pricing" className="py-20 max-w-[1200px] mx-auto px-4 sm:px-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card 1: Connect your music (5 cols) */}
        <div className="lg:col-span-5 glass-card rounded-3xl p-7 flex flex-col justify-between border border-emerald-500/20">
          <div>
            {/* Streaming Badges */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#1DB954]/20 border border-[#1DB954]/50 text-[#1DB954] font-bold text-sm">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                Motor Spotify API
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                {isConnected ? "Conectado ✓" : "100% Gratis"}
              </span>
            </div>

            <h3 className="font-display font-bold text-2xl sm:text-3xl text-white">Conecta tu Spotify</h3>
            <p className="mt-2.5 text-zinc-300 text-sm sm:text-base">
              Vincula tu cuenta de Spotify y cada partida ranked se construirá automáticamente con tus propias playlists, tus canciones favoritas y tu música preferida. Totalmente gratis.
            </p>
          </div>

          <div className="mt-6 space-y-2.5">
            {isConnected && playlists && playlists.length > 0 ? (
              <div className="space-y-2">
                <a
                  href="/play"
                  className="block w-full text-center py-3 rounded-2xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition"
                >
                  Jugar con mis Canciones Favoritas →
                </a>
                <div className="text-xs text-emerald-400 font-semibold text-center">
                  {playlists.length} playlists sincronizadas y listas para jugar
                </div>
              </div>
            ) : (
              <>
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 text-sm font-semibold text-emerald-100 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-goblinPrimary"></span>
                  Tus playlists convertidas en tests musicales competitivos
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 text-sm font-semibold text-emerald-100 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-goblinLime"></span>
                  Guarda temas descubiertos directo en tus Canciones que te Gustan
                </div>
                <a
                  href="/api/auth/spotify/login"
                  className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#1DB954]/20 hover:bg-[#1DB954]/30 border border-[#1DB954]/60 text-white font-bold text-xs transition"
                >
                  <svg className="w-4 h-4 text-[#1DB954] fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  Conectar Biblioteca de Spotify Gratis
                </a>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Climb the leaderboard (7 cols) */}
        <div id="leaderboard" className="lg:col-span-7 glass-card rounded-3xl p-7 flex flex-col justify-between border border-emerald-500/20">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-2xl sm:text-3xl text-white">Sube en la Clasificación</h3>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-400/20 border border-amber-400/50 text-amber-300">
                Temporada 1 Global
              </span>
            </div>
            <p className="mt-2 text-zinc-300 text-sm sm:text-base">
              Cada acierto te hace ganar puntos MMR y escalar puestos en el ranking mundial. Demuestra quién tiene mejor oído musical.
            </p>
          </div>

          <div className="mt-6 bg-[#0B1710] rounded-2xl p-5 border border-emerald-500/20">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-500/15">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-goblinLime flex items-center justify-center font-bold text-xs text-black">
                  <Crown className="w-4 h-4 text-black" />
                </div>
                <span className="font-display font-bold text-base text-white">Clasificación de Drake</span>
              </div>
              <button
                onClick={bumpOdometer}
                className="text-xs text-goblinLime hover:underline font-bold cursor-pointer"
              >
                Simular +Puntuación (+95 MMR)
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/30">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-amber-300 w-7 flex items-center gap-1">
                    <Crown className="w-3.5 h-3.5 text-amber-300" />
                    <span>1</span>
                  </span>
                  <span className="font-bold text-white">Jade</span>
                  <span className="text-xs text-amber-300/80">Gran Maestro · 212 partidas</span>
                </div>
                <span className="font-mono font-bold text-amber-300">48,210</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-zinc-300 w-5">2</span>
                  <span className="font-semibold text-white">Tom</span>
                  <span className="text-xs text-zinc-500">205 partidas</span>
                </div>
                <span className="font-mono font-bold text-zinc-200">47,950</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-amber-600 w-5">3</span>
                  <span className="font-semibold text-white">Sam</span>
                  <span className="text-xs text-zinc-500">198 partidas</span>
                </div>
                <span className="font-mono font-bold text-zinc-200">47,600</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-goblinLime w-5">5</span>
                  <span className="font-bold text-white">Lucas (Tú)</span>
                  <span className="text-xs text-emerald-300 font-semibold">Rango Esmeralda</span>
                </div>
                <span className="font-mono font-extrabold text-goblinLime text-base">
                  {lucasScore.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Discover new music (12 cols) */}
        <div className="lg:col-span-12 glass-card rounded-3xl p-7 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center border border-emerald-500/20">
          <div className="lg:col-span-5 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 border border-emerald-500/30 text-xs font-bold text-emerald-300">
              <svg className="w-4 h-4 text-[#1DB954] fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              Audio y Carátulas Oficiales de Spotify
            </div>
            <h3 className="font-display font-bold text-2xl sm:text-3xl text-white">Descubre y Guarda al Instante</h3>
            <p className="text-zinc-300 text-sm sm:text-base">
              Al finalizar cada ronda puedes consultar la lista de Spotify. Vuelve a escuchar el fragmento y guarda el tema con un solo toque en tus Me Gusta.
            </p>
            <div className="flex gap-2">
              <a
                href="/play"
                className="inline-block px-5 py-2.5 rounded-full bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-lg shadow-emerald-500/25 hover:scale-105 transition"
              >
                Lanzar Arena de Quiz Musical →
              </a>
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#0B1710] rounded-2xl p-5 border border-emerald-500/20">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3 flex justify-between items-center">
              <span>Vista previa de canciones de Spotify</span>
              <span className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                <Play className="w-2.5 h-2.5 text-goblinLime fill-current inline" /> para escuchar · <Heart className="w-2.5 h-2.5 text-emerald-400 fill-current inline" /> para guardar
              </span>
            </div>
            <div className="space-y-2.5">
              {FEATURE_TRACKS.map((t, idx) => {
                const isPlaying = playingId === t.id;
                const feedback = savedFeedback[t.id];

                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-white/[0.03] hover:bg-emerald-950/40 border border-emerald-500/15 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-emerald-500/80 font-bold w-5">
                        0{idx + 1}
                      </span>
                      <img
                        src={t.artworkUrl}
                        alt={t.title}
                        className="w-10 h-10 rounded-lg object-cover border border-emerald-500/20 shadow-md"
                      />
                      <button
                        onClick={() => handlePlaySample(t)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition cursor-pointer ${
                          isPlaying
                            ? "bg-goblinLime text-black animate-pulse"
                            : "bg-emerald-950 border border-emerald-500/40 text-emerald-300 hover:bg-goblinPrimary hover:text-black"
                        }`}
                        title={isPlaying ? "Pausar" : "Escuchar fragmento"}
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      </button>
                      <div className="truncate max-w-[160px] sm:max-w-[240px]">
                        <div className="text-sm font-bold text-white truncate">{t.title}</div>
                        <div className="text-xs text-zinc-400 truncate">{t.artist}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {feedback && (
                        <span className="text-xs font-bold text-goblinLime animate-bounce whitespace-nowrap">
                          {feedback}
                        </span>
                      )}
                      <button
                        onClick={() => handleSaveToSpotify(t)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-goblinLime hover:bg-emerald-950 transition cursor-pointer"
                        title="Guardar en Canciones Favoritas de Spotify"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
