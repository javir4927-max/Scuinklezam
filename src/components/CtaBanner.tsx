"use client";

import React from "react";
import Link from "next/link";

interface CtaBannerProps {
  onOpenMiniQuiz: (topic?: string) => void;
}

export default function CtaBanner({ onOpenMiniQuiz }: CtaBannerProps) {
  return (
    <section className="py-16 max-w-[1200px] mx-auto px-4 sm:px-6">
      <div className="cta-glow rounded-3xl p-10 sm:p-16 text-center border border-emerald-500/40 shadow-2xl">
        <h2 className="font-display font-extrabold text-3xl sm:text-5xl text-white">
          ¿Crees que sabes de música? Demuéstralo en <span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">Scuinklezam</span>.
        </h2>
        <p className="mt-4 text-zinc-300 text-base sm:text-lg max-w-xl mx-auto">
          Más de 500.000 apasionados de la música ya están compitiendo. Tu primera ronda de Spotify empieza en menos de 5 segundos. 100% gratis e ilimitado.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/ranked"
            className="px-8 py-4 rounded-full bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime text-black font-extrabold text-sm hover:scale-105 transition shadow-xl"
          >
            Entrar a la Arena Ranked (Gratis)
          </Link>
          <a
            href="/api/auth/spotify/login"
            className="px-6 py-4 rounded-full glass-elevated text-white font-bold text-sm hover:border-[#1DB954] transition flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-[#1DB954] fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Conectar Biblioteca de Spotify
          </a>
          <button
            onClick={() => onOpenMiniQuiz("Éxitos Pop")}
            className="px-6 py-4 rounded-full glass-elevated text-emerald-300 font-bold text-sm hover:border-emerald-500/40 transition cursor-pointer"
          >
            Mini-Quiz Rápido
          </button>
        </div>
      </div>
    </section>
  );
}
