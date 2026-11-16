"use client";

import React from "react";

const GENRES = [
  "Pop",
  "Reggaetón",
  "Rock en Español",
  "Trap Latino",
  "Éxitos de los 90s",
  "K-pop",
  "Urbano Latino",
  "Tus placeres culpables",
  "Viral Spotify España",
  "Indie / Alternativo",
];

interface GenreStripProps {
  onSelectGenre?: (genre: string) => void;
}

export default function GenreStrip({ onSelectGenre }: GenreStripProps) {
  return (
    <section className="py-4 bg-[#0B1710] border-y border-emerald-500/15 overflow-hidden">
      <div className="animate-marquee-left flex items-center gap-4">
        {[0, 1, 2, 3].map((cycle) => (
          <div key={cycle} className="flex items-center gap-4 pr-4">
            {GENRES.map((genre) => (
              <React.Fragment key={`${cycle}-${genre}`}>
                <button
                  onClick={() => onSelectGenre && onSelectGenre(genre)}
                  className="px-4 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-500/20 text-xs font-bold text-emerald-200 whitespace-nowrap hover:border-goblinLime hover:text-white transition cursor-pointer"
                >
                  {genre}
                </button>
                <span className="text-goblinLime">✦</span>
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
