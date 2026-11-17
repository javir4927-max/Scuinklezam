"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Link2, Gamepad2, Headphones } from "lucide-react";

interface LobbySectionProps {
  onOpenMiniQuiz: (topic?: string) => void;
}

export default function LobbySection({ onOpenMiniQuiz }: LobbySectionProps) {
  const [lobbyState, setLobbyState] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [homeJoinCode, setHomeJoinCode] = useState<string>("K7QP");

  useEffect(() => {
    const timer = setInterval(() => {
      setLobbyState((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const copyRoomCode = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/play?room=K7QP` : "K7QP";
      navigator.clipboard.writeText(shareUrl);
    }
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1800);
  };

  return (
    <section className="py-20 md:py-28 max-w-[1200px] mx-auto px-4 sm:px-6">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight">
          Desafía a tus amigos en <span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">Scuinklezam</span>
        </h2>
        <p className="mt-4 text-zinc-300 text-base sm:text-lg">
          Crea una sala privada, comparte el código y adivinad canciones juntos en tiempo real. Tus amigos se unen desde cualquier móvil o navegador con su cuenta de Spotify. 100% gratis e ilimitado.
        </p>
      </div>

      {/* Interactive State Tabs */}
      <div className="mt-8 flex justify-center gap-2">
        <button
          onClick={() => setLobbyState(0)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
            lobbyState === 0
              ? "bg-goblinPrimary text-black"
              : "bg-emerald-950/40 text-zinc-400 hover:text-white border border-emerald-500/20"
          }`}
        >
          1. Sala de Espera (K7QP)
        </button>
        <button
          onClick={() => setLobbyState(1)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
            lobbyState === 1
              ? "bg-goblinPrimary text-black"
              : "bg-emerald-950/40 text-zinc-400 hover:text-white border border-emerald-500/20"
          }`}
        >
          2. Cuenta Atrás (3-2-1)
        </button>
        <button
          onClick={() => setLobbyState(2)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
            lobbyState === 2
              ? "bg-goblinPrimary text-black"
              : "bg-emerald-950/40 text-zinc-400 hover:text-white border border-emerald-500/20"
          }`}
        >
          3. Ronda Ranked en Vivo
        </button>
      </div>

      {/* State Container */}
      <div className="mt-6 max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-8 shadow-2xl relative min-h-[420px] flex flex-col justify-between border border-emerald-500/20">
        {/* STATE 0: LOBBY VIEW */}
        {lobbyState === 0 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-emerald-500/15">
              <div>
                <h3 className="font-display font-bold text-xl text-white">Sala Multijugador</h3>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 border border-emerald-500/30 text-emerald-300">
                  Sala Privada Gratuita
                </span>
              </div>
              <div className="flex items-center gap-3 bg-white/[0.04] px-4 py-2.5 rounded-2xl border border-emerald-500/20">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-goblinPrimary to-goblinLime flex items-center justify-center font-bold text-xs text-black">
                  POP
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Top 50 Spotify</div>
                  <div className="text-xs text-zinc-400">50 canciones</div>
                </div>
                <button
                  onClick={() => onOpenMiniQuiz("Éxitos Pop")}
                  className="ml-2 text-xs font-semibold text-goblinLime hover:underline cursor-pointer"
                >
                  Cambiar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Invite Code Box */}
              <div className="bg-[#0B1710] rounded-2xl p-5 border border-emerald-500/15 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">Invitar Amigos</div>
                  <div className="mt-3 flex items-center justify-between bg-black/60 px-4 py-3 rounded-xl border border-emerald-500/30">
                    <span className="font-mono font-extrabold text-2xl tracking-widest text-goblinLime">K7QP</span>
                    <button
                      onClick={copyRoomCode}
                      className="px-3.5 py-1.5 rounded-lg bg-goblinPrimary hover:bg-emerald-400 text-black text-xs font-extrabold transition cursor-pointer"
                    >
                      {copied ? "¡Copiado!" : "Invitar"}
                    </button>
                  </div>
                </div>
                <p className="mt-4 text-xs text-zinc-400">Se necesitan al menos 2 jugadores para comenzar la partida.</p>
              </div>

              {/* Players List */}
              <div className="bg-[#0B1710] rounded-2xl p-5 border border-emerald-500/15">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">Jugadores en Sala (4)</div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Anfitrión (Tú)</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>En línea
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">Maya</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>En línea
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">Leo</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>En línea
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-400">Zoé</span>
                    <span className="text-xs text-zinc-500 italic">Invitada — esperando unión…</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Botones Operativos Reales Directos en la Home */}
            <div className="p-4 rounded-2xl bg-black/40 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
              <Link
                href="/play?create=true"
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md hover:opacity-95 transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4 text-black" />
                <span>Crear Sala Multijugador</span>
              </Link>

              <div className="flex w-full sm:w-auto gap-2">
                <input
                  type="text"
                  value={homeJoinCode}
                  onChange={(e) => setHomeJoinCode(e.target.value.toUpperCase())}
                  placeholder="K7QP"
                  maxLength={4}
                  className="w-20 text-center px-2 py-2.5 rounded-xl bg-black/60 border border-emerald-500/30 font-mono font-extrabold text-sm text-goblinLime uppercase focus:outline-none focus:border-goblinLime"
                />
                <Link
                  href={`/play?room=${homeJoinCode.trim() || "K7QP"}`}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-emerald-500/30 font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <Link2 className="w-4 h-4 text-emerald-400" />
                  <span>Unirse con Código</span>
                </Link>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                onClick={() => setLobbyState(1)}
                className="flex-1 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-emerald-500/20 font-bold text-zinc-300 text-xs transition cursor-pointer"
              >
                Ver Demostración Rápida
              </button>
              <Link
                href="/ranked"
                className="flex-1 py-3 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-goblinLime/40 font-extrabold text-goblinLime text-xs transition text-center flex items-center justify-center gap-2"
              >
                <Gamepad2 className="w-4 h-4 text-goblinLime" />
                <span>Explorar Modo Ranked</span>
              </Link>
            </div>
          </div>
        )}

        {/* STATE 1: COUNTDOWN VIEW */}
        {lobbyState === 1 && (
          <div className="w-full max-w-2xl mx-auto px-4 py-12 text-center overflow-hidden flex flex-col items-center justify-center my-auto">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
              La partida empieza en
            </div>
            <div className="font-display font-black text-[clamp(3.5rem,10vw,6rem)] leading-none my-4 flex items-center justify-center gap-6">
              <span className="text-zinc-700">3</span>
              <span className="text-zinc-500">2</span>
              <span className="text-goblinLime scale-125 animate-bounce">1</span>
            </div>
            <div className="font-display font-extrabold text-[clamp(1.75rem,5vw,3.25rem)] leading-tight tracking-tight text-white max-w-full break-words px-2">
              ¡Preparados!
            </div>
            <div className="text-sm sm:text-base font-medium text-zinc-300 mt-2">
              ¡Escucha con atención! La canción suena en breve.
            </div>
          </div>
        )}

        {/* STATE 2: ACTIVE GAME ROUND 1 */}
        {lobbyState === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-emerald-500/15">
              <div>
                <span className="font-bold text-white">Éxitos Mundiales</span>
                <span className="text-xs text-zinc-400 ml-2">Canción 1 de 10</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500 text-goblinLime font-bold text-xs flex items-center justify-center">
                  15
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs">
                  +97 pts
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-semibold">
              <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500 text-white">
                BAILE INoLVIDABLE
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-emerald-500/15 text-zinc-200">
                24K Magic
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-emerald-500/15 text-zinc-200">
                Die With A Smile
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-emerald-500/15 text-zinc-200">
                Anti-Hero
              </div>
            </div>
            <div className="bg-[#0B1710] rounded-2xl p-4 border border-emerald-500/15">
              <div className="text-xs font-bold uppercase text-emerald-400 mb-2">Clasificación en Vivo</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white/[0.03]">
                  <strong>1 Tú</strong>
                  <br />
                  <span className="text-zinc-400">Escuchando… 0pts</span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.03]">
                  <strong>2 Maya</strong>
                  <br />
                  <span className="text-zinc-400">Escuchando… 0pts</span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.03]">
                  <strong>3 Leo</strong>
                  <br />
                  <span className="text-zinc-400">Escuchando… 0pts</span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.03]">
                  <strong>#4 Zoé</strong>
                  <br />
                  <span className="text-zinc-400">Escuchando… 0pts</span>
                </div>
              </div>
            </div>

            <Link
              href="/play?create=true"
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime font-extrabold text-black text-sm shadow-lg shadow-emerald-500/25 hover:opacity-95 transition text-center flex items-center justify-center gap-2"
            >
              <Headphones className="w-5 h-5 text-black" />
              <span>¡Crear Sala y Jugar en Vivo!</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
