"use client";

import React from "react";

interface ArtistSectionProps {
  onOpenMiniQuiz: (topic?: string) => void;
  onSelectArtist?: (artist: string) => void;
}

const ARTISTS_ROW_1 = [
  "Bad Bunny",
  "Taylor Swift",
  "Michael Jackson",
  "Drake",
  "Billie Eilish",
  "Eminem",
  "Ariana Grande",
  "Lana Del Rey",
];

const ARTISTS_ROW_2 = [
  "The Weeknd",
  "Olivia Rodrigo",
  "Kendrick Lamar",
  "Bruno Mars",
  "Frank Ocean",
  "Juice WRLD",
  "Travis Scott",
  "Dua Lipa",
];

const GENRES = [
  "Pop",
  "Reggaetón",
  "Rock",
  "K-Pop",
  "Éxitos 80s",
  "Éxitos 90s",
  "Éxitos Latinos",
  "Country",
  "Metal",
  "Trap Latino",
];

export default function ArtistSection({ onOpenMiniQuiz, onSelectArtist }: ArtistSectionProps) {
  const handleClick = (name: string) => {
    if (onSelectArtist) {
      onSelectArtist(name);
    } else {
      onOpenMiniQuiz(name);
    }
  };

  const renderArtistItems = (list: string[], prefix: string) => {
    return [0, 1, 2, 3].map((cycle) => (
      <React.Fragment key={`${prefix}-${cycle}`}>
        {list.map((name) => {
          const initials = name
            .split(" ")
            .map((n) => n[0])
            .join("");
          return (
            <div
              key={`${prefix}-${cycle}-${name}`}
              onClick={() => handleClick(name)}
              className="cursor-pointer glass-elevated hover:border-goblinLime px-4 py-2.5 rounded-2xl flex items-center gap-3 mr-3 transition group shrink-0 border border-emerald-500/20"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-goblinPrimary via-goblinClover to-goblinLime flex items-center justify-center font-bold text-xs text-black shadow-md">
                {initials}
              </div>
              <span className="font-bold text-sm text-white whitespace-nowrap">{name}</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 group-hover:bg-goblinPrimary group-hover:text-black text-[11px] font-bold text-emerald-300 transition border border-emerald-500/30">
                Jugar
              </span>
            </div>
          );
        })}
      </React.Fragment>
    ));
  };

  return (
    <section className="py-20 overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-950 border border-emerald-500/30 text-xs font-bold text-emerald-300 mb-4">
          <svg className="w-3.5 h-3.5 text-[#1DB954] fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Buscador de Catálogo de Spotify
        </div>
        <h2 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight">
          Domina a tus artistas favoritos
        </h2>
        <p className="mt-4 text-zinc-300 text-base sm:text-lg max-w-2xl mx-auto">
          Cada artista en Spotify tiene su propia arena en Scuinklezam. Deja de presumir que eres su mayor fan: demuéstralo en la clasificación.
        </p>
      </div>

      {/* Row 1 Artist Marquee */}
      <div className="mt-10 overflow-hidden">
        <div className="animate-marquee-left gap-4 py-2 flex">
          {renderArtistItems(ARTISTS_ROW_1, "row1")}
        </div>
      </div>

      {/* Row 2 Artist Marquee */}
      <div className="mt-4 overflow-hidden">
        <div className="animate-marquee-right gap-4 py-2 flex">
          {renderArtistItems(ARTISTS_ROW_2, "row2")}
        </div>
      </div>

      {/* Quizzes by Genre */}
      <div className="mt-16 max-w-[1000px] mx-auto px-4 sm:px-6 text-center">
        <h3 className="font-display font-bold text-xl sm:text-2xl text-white mb-6">
          Arenas Ranked por Género
        </h3>
        <div className="flex flex-wrap justify-center gap-3">
          {GENRES.map((genre) => (
            <button
              key={genre}
              onClick={() => onOpenMiniQuiz(genre)}
              className="px-5 py-2.5 rounded-full glass-elevated hover:border-goblinLime hover:bg-emerald-950/60 font-semibold text-sm transition cursor-pointer text-emerald-200 border border-emerald-500/20"
            >
              {genre}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
