"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pause, Volume2, Timer, Sparkles, Heart, ExternalLink, Crown, Check, X, Music2 } from "lucide-react";
import { playSynthNote } from "@/lib/audio";
import { playCorrectSound, playWrongSound } from "@/lib/soundEffects";
import { audioPlayer, AudioPlayerState } from "@/lib/audioPlayer";
import { SpotifyTrackItem, FALLBACK_SPOTIFY_TRACKS, getFallbackArtwork } from "@/lib/spotifyTypes";
import { calculateRoundPoints, ROUND_DURATION_SEC, REVEAL_DURATION_MS } from "@/lib/scoring";
import { normalizeSongTitle, getCoherentDistractors } from "@/lib/songMatching";

interface MiniQuizModalProps {
  isOpen: boolean;
  topic?: string;
  customTracks?: SpotifyTrackItem[];
  onClose: () => void;
}

export interface QuizRoundOption {
  title: string;
  artist: string;
  artworkUrl: string;
}

interface QuizRoundData {
  correctTrack: SpotifyTrackItem;
  options: (QuizRoundOption | string)[];
  correctIndex: number;
}

function normalizeQuizOption(opt: QuizRoundOption | string): QuizRoundOption {
  if (typeof opt === "string") {
    const parts = opt.split(" — ");
    return {
      title: parts[0] || opt,
      artist: parts[1] || "",
      artworkUrl: getFallbackArtwork(parts[0] || opt, parts[1] || ""),
    };
  }
  return opt;
}

export default function MiniQuizModal({
  isOpen,
  topic = "Éxitos Pop",
  customTracks,
  onClose,
}: MiniQuizModalProps) {
  const [rounds, setRounds] = useState<QuizRoundData[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [answeredIdx, setAnsweredIdx] = useState<number | null>(null);
  const [isRevealing, setIsRevealing] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(ROUND_DURATION_SEC);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [answersHistory, setAnswersHistory] = useState<
    Array<{ track: SpotifyTrackItem; isCorrect: boolean; points: number }>
  >([]);
  const [playingPreviewUrl, setPlayingPreviewUrl] = useState<string | null>(null);
  const [scorePopup, setScorePopup] = useState<{
    points: number;
    isCorrect: boolean;
    optionIndex: number;
    key: number;
  } | null>(null);
  const scorePopupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [audioState, setAudioState] = useState<AudioPlayerState>({
    isPlaying: false,
    isBlocked: false,
    url: null,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to central AudioPlayer state changes
  useEffect(() => {
    const unsub = audioPlayer.subscribe((state) => {
      setAudioState(state);
    });
    return () => unsub();
  }, []);

  // Cleanup audio & timers when closing modal
  const handleClose = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    audioPlayer.stop();
    onClose();
  }, [onClose]);

  // Build 10 structured quiz rounds from a validated pool
  const buildRounds = useCallback((pool: SpotifyTrackItem[]) => {
    const validPool = pool.filter(
      (t) => t.previewUrl && t.previewUrl.startsWith("http")
    );
    const catalog = validPool.length >= 4 ? validPool : FALLBACK_SPOTIFY_TRACKS;
    const shuffled = [...catalog].sort(() => 0.5 - Math.random());
    const count = Math.min(10, shuffled.length);
    const generated: QuizRoundData[] = [];

    for (let i = 0; i < count; i++) {
      const correct = shuffled[i];

      const correctOption: QuizRoundOption = {
        title: correct.title,
        artist: correct.artist,
        artworkUrl: correct.artworkUrl || getFallbackArtwork(correct.title, correct.artist),
      };

      // Distractors strictly from the same topic without duplicate titles
      const distractors = getCoherentDistractors(correct, catalog, 3);
      const options: QuizRoundOption[] = [correctOption, ...distractors].sort(() => 0.5 - Math.random());
      const correctIndex = options.findIndex(
        (o) => normalizeSongTitle(o.title) === normalizeSongTitle(correctOption.title)
      );

      generated.push({
        correctTrack: {
          ...correct,
          artworkUrl: correct.artworkUrl || getFallbackArtwork(correct.title, correct.artist),
        },
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
      });
    }

    setRounds(generated);
    setCurrentRoundIdx(0);
    setAnsweredIdx(null);
    setIsRevealing(false);
    setTimeLeft(ROUND_DURATION_SEC);
    setIsFinished(false);
    setScore(0);
    setAnswersHistory([]);
    setPlayingPreviewUrl(null);
    setIsLoading(false);
    setFailedImages({});

    if (generated[0]?.correctTrack?.previewUrl) {
      audioPlayer.playTrack(generated[0].correctTrack.previewUrl);
      if (generated[1]?.correctTrack?.previewUrl) {
        audioPlayer.preloadNext(generated[1].correctTrack.previewUrl);
      }
    }
  }, []);

  // Resilient multi-tier track fetching on modal open
  useEffect(() => {
    if (!isOpen) {
      audioPlayer.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      return;
    }

    setIsLoading(true);
    setRounds([]);
    setCurrentRoundIdx(0);
    setAnsweredIdx(null);
    setIsRevealing(false);
    setIsFinished(false);

    if (customTracks && customTracks.length >= 4) {
      buildRounds(customTracks);
      return;
    }

    let isMounted = true;

    // 1. Try Spotify search endpoint
    fetch(`/api/spotify/search?q=${encodeURIComponent(topic)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.tracks && data.tracks.length >= 4) {
          buildRounds(data.tracks);
        } else {
          // 2. Resilient fallback to /api/music (iTunes resolver)
          fetch(`/api/music?term=${encodeURIComponent(topic)}`)
            .then((r) => r.json())
            .then((mdata) => {
              if (!isMounted) return;
              if (mdata.success && mdata.tracks && mdata.tracks.length >= 4) {
                buildRounds(mdata.tracks);
              } else {
                buildRounds(FALLBACK_SPOTIFY_TRACKS);
              }
            })
            .catch(() => {
              if (isMounted) buildRounds(FALLBACK_SPOTIFY_TRACKS);
            });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        // Network fallback
        fetch(`/api/music?term=${encodeURIComponent(topic)}`)
          .then((r) => r.json())
          .then((mdata) => {
            if (!isMounted) return;
            if (mdata.success && mdata.tracks && mdata.tracks.length >= 4) {
              buildRounds(mdata.tracks);
            } else {
              buildRounds(FALLBACK_SPOTIFY_TRACKS);
            }
          })
          .catch(() => {
            if (isMounted) buildRounds(FALLBACK_SPOTIFY_TRACKS);
          });
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, topic, customTracks, buildRounds]);

  // Answer handler
  const handleAnswer = useCallback(
    (idx: number) => {
      if (isRevealing || isFinished || !rounds[currentRoundIdx]) return;

      const currentRound = rounds[currentRoundIdx];
      setIsRevealing(true);
      setAnsweredIdx(idx);

      const rawOpt = idx >= 0 ? currentRound.options[idx] : null;
      const chosenTitle = rawOpt ? (typeof rawOpt === "string" ? rawOpt : rawOpt.title) : null;
      const isCorrect = chosenTitle
        ? normalizeSongTitle(chosenTitle) === normalizeSongTitle(currentRound.correctTrack.title)
        : idx === currentRound.correctIndex;

      // Exponential formula points (max 100 per question, max 1000 in 10 questions)
      const elapsedSec = Math.max(0, ROUND_DURATION_SEC - timeLeft);
      const pointsEarned = calculateRoundPoints(isCorrect, elapsedSec);

      if (isCorrect) {
        setScore((prev) => prev + pointsEarned);
        playCorrectSound();
      } else {
        playWrongSound();
      }

      setAnswersHistory((prev) => [
        ...prev,
        {
          track: currentRound.correctTrack,
          isCorrect,
          points: pointsEarned,
        },
      ]);

      // Trigger floating arcade score animation (+X pts / 0 puntos)
      if (scorePopupTimerRef.current) clearTimeout(scorePopupTimerRef.current);
      setScorePopup({
        points: pointsEarned,
        isCorrect,
        optionIndex: idx,
        key: Date.now(),
      });
      scorePopupTimerRef.current = setTimeout(() => {
        setScorePopup(null);
      }, 1800);

      // Preload next round audio while revealing
      if (currentRoundIdx + 1 < rounds.length) {
        audioPlayer.preloadNext(rounds[currentRoundIdx + 1]?.correctTrack?.previewUrl);
      }

      // Display reveal card for 4.5 seconds (REVEAL_DURATION_MS) before advancing
      advanceTimerRef.current = setTimeout(() => {
        setScorePopup(null);
        if (currentRoundIdx + 1 < rounds.length) {
          const nextIdx = currentRoundIdx + 1;
          setCurrentRoundIdx(nextIdx);
          setAnsweredIdx(null);
          setIsRevealing(false);
          setTimeLeft(ROUND_DURATION_SEC);
          setSavedFeedback(null);

          const nextTrack = rounds[nextIdx].correctTrack;
          if (nextTrack?.previewUrl) {
            audioPlayer.playTrack(nextTrack.previewUrl);
          }
          if (nextIdx + 1 < rounds.length) {
            audioPlayer.preloadNext(rounds[nextIdx + 1]?.correctTrack?.previewUrl);
          }
        } else {
          setIsRevealing(false);
          setIsFinished(true);
          audioPlayer.stop();
        }
      }, REVEAL_DURATION_MS);
    },
    [isRevealing, isFinished, rounds, currentRoundIdx, timeLeft]
  );

  // 15-second Round Timer
  useEffect(() => {
    if (!isOpen || isRevealing || isFinished || isLoading || rounds.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleAnswer(-1); // Timeout as incorrect answer
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, currentRoundIdx, isRevealing, isFinished, isLoading, rounds.length, handleAnswer]);

  // Keyboard controls: 1-4 for options, Escape to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (["1", "2", "3", "4"].includes(e.key) && !isRevealing && !isFinished) {
        const optionIndex = parseInt(e.key, 10) - 1;
        handleAnswer(optionIndex);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isRevealing, isFinished, handleAnswer, handleClose]);

  // Save current track to Spotify
  const handleSaveTrack = async (track: SpotifyTrackItem) => {
    try {
      const res = await fetch("/api/spotify/save-track", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      const data = await res.json();
      setSavedFeedback(data.demo ? "Guardada en favoritos" : "Guardada en Spotify");
      playSynthNote(880, 0.25);
    } catch {
      setSavedFeedback("Guardada");
    }
  };

  if (!isOpen) return null;

  const currentRound = rounds[currentRoundIdx];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="glass-card rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-emerald-500/30 shadow-2xl relative bg-[#09150E]/95">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-emerald-950 flex items-center justify-center text-zinc-300 transition cursor-pointer border border-emerald-500/20"
        >
          ✕
        </button>

        {/* Header: Clean 2-Row / Flex-Wrap on Mobile */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-500/15 pr-10">
          {/* Fila 1 Izquierda: Tema + Ronda */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display font-bold text-sm sm:text-base text-white truncate max-w-[42vw] sm:max-w-[200px]" title={topic}>
              {topic}
            </span>
            <span className="text-xs text-emerald-400/90 font-semibold shrink-0">
              · Ronda {currentRoundIdx + 1}/{rounds.length || 5}
            </span>
          </div>

          {/* Fila 1 Derecha: Timer + Score */}
          <div className="flex items-center gap-2 shrink-0">
            {!isLoading && !isFinished && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border flex items-center gap-1 shrink-0 ${
                timeLeft <= 5
                  ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                  : "bg-black/40 text-emerald-300 border-emerald-500/30"
              }`}>
                <Timer className="w-3 h-3 text-emerald-300" />
                <span>{timeLeft}s</span>
              </span>
            )}
            <div className="relative shrink-0">
              <span className="px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-500/40 text-goblinLime font-mono font-bold text-xs">
                {score} pts
              </span>
            </div>
          </div>

          {/* Fila 2: Feedback flotante cuando se responde */}
          {scorePopup && (
            <div className="w-full flex justify-center py-0.5 animate-fade-in">
              <div
                key={`header_popup_${scorePopup.key}`}
                className={`px-3 py-1 rounded-full font-mono font-black text-xs tracking-wider flex items-center gap-1.5 shadow-lg select-none ${
                  scorePopup.isCorrect
                    ? "text-emerald-300 bg-emerald-950/90 border border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                    : "text-rose-300 bg-rose-950/90 border border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.5)] animate-wrong-shake"
                }`}
              >
                <span>{scorePopup.isCorrect ? `+${scorePopup.points} pts · ¡Correcto!` : "0 pts · Incorrecto"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-goblinLime border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="text-sm font-semibold text-emerald-300">Cargando pistas de alta definición con audio...</div>
          </div>
        )}

        {/* Quiz Arena */}
        {!isLoading && !isFinished && currentRound && (
          <>
            {/* Audio Visualizer & Prompt Bar */}
            <div className="my-4 p-3.5 rounded-2xl bg-[#0B1710] border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => audioPlayer.playTrack(currentRound.correctTrack.previewUrl)}
                  className="w-10 h-10 rounded-full bg-gradient-to-tr from-goblinPrimary via-goblinClover to-goblinLime flex items-center justify-center text-black font-bold shadow-lg shadow-emerald-500/25 hover:scale-105 active:scale-95 transition cursor-pointer"
                  title="Volver a escuchar"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </button>
                <div>
                  <div className="text-sm font-bold text-white">¿Qué canción está sonando?</div>
                  <div className="text-xs text-zinc-400">Pulsa 1-4 en el teclado o toca una opción</div>
                </div>
              </div>

              {/* Audio Status Pill */}
              <div className="flex items-center gap-2">
                {audioState.isBlocked && (
                  <button
                    onClick={() => audioPlayer.resume()}
                    className="px-2.5 py-1 rounded-xl bg-goblinLime text-black font-bold text-xs hover:bg-emerald-400 animate-bounce transition flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Activar Audio</span>
                  </button>
                )}
                <div className="flex items-end gap-1 h-5">
                  <span className={`w-1 bg-goblinPrimary rounded-full ${audioState.isPlaying ? "eq-bar-1" : "h-2"}`}></span>
                  <span className={`w-1 bg-goblinLime rounded-full ${audioState.isPlaying ? "eq-bar-2" : "h-3"}`}></span>
                  <span className={`w-1 bg-emerald-400 rounded-full ${audioState.isPlaying ? "eq-bar-3" : "h-2"}`}></span>
                  <span className={`w-1 bg-goblinLime rounded-full ${audioState.isPlaying ? "eq-bar-2" : "h-1"}`}></span>
                </div>
              </div>
            </div>

            {/* Answer Reveal (Shows for 1.8 seconds) */}
            {isRevealing && (
              <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-[#102218] to-black border border-goblinLime/50 flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-3">
                  <img
                    src={currentRound.correctTrack.artworkUrl}
                    alt={currentRound.correctTrack.title}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = getFallbackArtwork(
                        currentRound.correctTrack.title,
                        currentRound.correctTrack.artist
                      );
                    }}
                    className="w-14 h-14 rounded-xl object-cover border border-emerald-500/40 shadow-lg"
                  />
                  <div className="truncate max-w-[200px]">
                    <div className="text-[10px] uppercase font-extrabold tracking-wider text-goblinLime flex items-center gap-1">
                      {answeredIdx === currentRound.correctIndex ? (
                        <>
                          <span>¡Correcto!</span>
                          <Sparkles className="w-3 h-3 text-goblinLime" />
                        </>
                      ) : (
                        "Respuesta Correcta:"
                      )}
                    </div>
                    <div className="text-sm font-bold text-white truncate">{currentRound.correctTrack.title}</div>
                    <div className="text-xs text-zinc-300 truncate">{currentRound.correctTrack.artist}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveTrack(currentRound.correctTrack)}
                    className="px-3 py-1.5 rounded-xl bg-[#1DB954]/20 hover:bg-[#1DB954]/40 border border-[#1DB954]/50 text-xs font-bold text-[#1DB954] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Heart className="w-3.5 h-3.5 fill-current" />
                    <span>{savedFeedback || "Guardar"}</span>
                  </button>
                  <a
                    href={currentRound.correctTrack.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs"
                    title="Abrir en Spotify"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            {/* 4 Interactive Options */}
            <div className="space-y-2.5">
              {currentRound.options.map((opt, idx) => {
                const optData = normalizeQuizOption(opt);
                const isCorrect = idx === currentRound.correctIndex;
                const isSelected = idx === answeredIdx;
                const imgKey = `mini_${currentRoundIdx}_${idx}`;

                let btnStyle =
                  "w-full flex items-center justify-between gap-3.5 min-h-[56px] px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-emerald-950/50 border border-emerald-500/15 hover:border-goblinLime text-white transition-all cursor-pointer text-base font-semibold";

                if (isRevealing) {
                  if (isCorrect) {
                    btnStyle =
                      "w-full flex items-center justify-between gap-3.5 min-h-[56px] px-4 py-3 rounded-2xl bg-[#22C55E]/20 border-2 border-[#22C55E] text-white shadow-lg shadow-emerald-500/20 text-base font-semibold";
                  } else if (isSelected) {
                    btnStyle =
                      "w-full flex items-center justify-between gap-3.5 min-h-[56px] px-4 py-3 rounded-2xl bg-[#EF4444]/20 border-2 border-[#EF4444] text-white text-base font-semibold";
                  } else {
                    btnStyle =
                      "w-full flex items-center justify-between gap-3.5 min-h-[56px] px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/5 opacity-60 text-base font-semibold";
                  }
                }

                return (
                  <button
                    key={`${currentRoundIdx}_${optData.title}_${idx}`}
                    onClick={() => handleAnswer(idx)}
                    className={`${btnStyle} relative overflow-visible`}
                    disabled={isRevealing}
                  >
                    {/* Floating Arcade Score Popup */}
                    {scorePopup && scorePopup.optionIndex === idx && (
                      <div
                        key={`popup_${scorePopup.key}`}
                        className={`absolute -top-4 sm:-top-5 left-1/2 -translate-x-1/2 pointer-events-none z-30 px-3.5 py-1.5 rounded-full font-mono font-black text-sm tracking-wider flex items-center gap-1.5 whitespace-nowrap animate-score-float select-none ${
                          scorePopup.isCorrect
                            ? "text-emerald-300 bg-emerald-500/20 border-2 border-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.65)] backdrop-blur-md"
                            : "text-rose-300 bg-rose-500/20 border-2 border-rose-500/80 shadow-[0_0_30px_rgba(244,63,94,0.65)] backdrop-blur-md animate-wrong-shake"
                        }`}
                      >
                        {scorePopup.isCorrect ? (
                          <>
                            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>+{scorePopup.points} pts</span>
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>0 puntos</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Left: Artwork & Center: Title + Artist */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-emerald-950/80 border border-white/10 relative flex items-center justify-center">
                        {failedImages[imgKey] ? (
                          <Music2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <img
                            src={optData.artworkUrl}
                            alt={optData.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedImages((prev) => ({
                                ...prev,
                                [imgKey]: true,
                              }))
                            }
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="font-semibold text-sm sm:text-base text-white line-clamp-1">
                          {optData.title}
                        </div>
                        <div className="text-xs text-zinc-400 line-clamp-1">
                          {optData.artist}
                        </div>
                      </div>
                    </div>

                    {/* Right: Keyboard shortcut badge or Check/X icon */}
                    <div className="shrink-0 ml-2">
                      {isRevealing && isCorrect ? (
                        <Check className="w-5 h-5 text-emerald-400" />
                      ) : isRevealing && isSelected && !isCorrect ? (
                        <X className="w-5 h-5 text-rose-400" />
                      ) : (
                        <kbd className="px-2 py-1 text-xs rounded-md bg-white/10 font-mono text-zinc-300">
                          {idx + 1}
                        </kbd>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Finished Screen with Songs Breakdown */}
        {!isLoading && isFinished && (
          <div className="py-4 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-goblinPrimary to-goblinLime flex items-center justify-center font-bold text-2xl text-black mx-auto shadow-lg shadow-emerald-500/30">
                <Crown className="w-7 h-7 text-black" />
              </div>
              <div className="font-display font-black text-4xl sm:text-6xl text-goblinLime leading-none px-4 py-2">
                {score} <span className="text-xl sm:text-2xl text-zinc-400 font-normal">/ 1000 pts</span>
              </div>
              <p className="text-xs text-zinc-300">
                ¡Completaste las 10 rondas! {answersHistory.filter((a) => a.isCorrect).length} de {answersHistory.length} acertadas
              </p>
            </div>

            {/* Song Breakdown */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {answersHistory.map((item, idx) => {
                const isCurrentPlaying = playingPreviewUrl === item.track.previewUrl;
                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-black/40 border border-emerald-500/15 flex items-center justify-between gap-3"
                  >
                    <div
                      className={`w-1 self-stretch -my-2.5 -ml-2.5 rounded-l-xl shrink-0 ${
                        item.isCorrect ? "bg-emerald-400" : "bg-rose-500"
                      }`}
                    />

                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-1">
                      <img
                        src={item.track.artworkUrl}
                        alt={item.track.title}
                        className="w-9 h-9 rounded-lg object-cover shrink-0 border border-emerald-500/30 bg-emerald-950"
                      />
                      <div className="min-w-0 text-left">
                        <div className="font-bold text-xs text-white truncate">
                          {item.track.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {item.track.artist}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          item.isCorrect
                            ? "text-emerald-300 bg-emerald-950/80 border border-emerald-500/40"
                            : "text-rose-400 bg-rose-950/80 border border-rose-500/40"
                        }`}
                      >
                        {item.isCorrect ? `+${item.points} pts` : "0 pts"}
                      </span>

                      {item.track.previewUrl && (
                        <button
                          onClick={() => {
                            if (isCurrentPlaying) {
                              audioPlayer.stop();
                              setPlayingPreviewUrl(null);
                            } else {
                              audioPlayer.playTrack(item.track.previewUrl);
                              setPlayingPreviewUrl(item.track.previewUrl);
                            }
                          }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                            isCurrentPlaying
                              ? "bg-goblinLime text-black"
                              : "bg-white/[0.08] hover:bg-white/[0.16] text-white"
                          }`}
                          title={isCurrentPlaying ? "Pausar" : "Escuchar fragmento de 30s"}
                        >
                          {isCurrentPlaying ? (
                            <Pause className="w-3 h-3 fill-current" />
                          ) : (
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => buildRounds(FALLBACK_SPOTIFY_TRACKS)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-emerald-300 font-bold text-xs transition cursor-pointer"
              >
                Jugar de Nuevo
              </button>
              <a
                href="/ranked"
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime text-black font-extrabold text-xs text-center shadow-lg shadow-emerald-500/30 hover:scale-[1.02] transition block"
              >
                Ir a la Arena Ranked Oficial →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
