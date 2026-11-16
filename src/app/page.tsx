"use client";

import React, { useState, useEffect } from "react";
import { Music2, Gamepad2, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import GenreStrip from "@/components/GenreStrip";
import LobbySection from "@/components/LobbySection";
import BentoFeatures from "@/components/BentoFeatures";
import ArtistSection from "@/components/ArtistSection";
import GameNightSection from "@/components/GameNightSection";
import ReviewsSection from "@/components/ReviewsSection";
import FaqSection from "@/components/FaqSection";
import ContactSection from "@/components/ContactSection";
import CtaBanner from "@/components/CtaBanner";
import Footer from "@/components/Footer";
import MiniQuizModal from "@/components/MiniQuizModal";
import SpotifyConnectModal from "@/components/SpotifyConnectModal";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";

export default function ScuinklezamLandingPage() {
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizTopic, setQuizTopic] = useState("Éxitos Pop");
  const [customQuizTracks, setCustomQuizTracks] = useState<SpotifyTrackItem[] | undefined>(undefined);
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);
  const [topicModal, setTopicModal] = useState<string | null>(null);

  const handleOpenQuiz = (topic?: string, tracks?: SpotifyTrackItem[]) => {
    setQuizTopic(topic || "Éxitos Pop");
    setCustomQuizTracks(tracks);
    setIsQuizOpen(true);
  };

  const handleCloseQuiz = () => {
    setIsQuizOpen(false);
    setCustomQuizTracks(undefined);
  };

  return (
    <div className="min-h-screen bg-[#060D09] text-white selection:bg-goblinPrimary selection:text-black">
      {/* 1. BARRA DE NAVEGACIÓN */}
      <Navbar
        onOpenMiniQuiz={handleOpenQuiz}
        onOpenSpotifyModal={() => setIsSpotifyModalOpen(true)}
      />

      <main>
        {/* 2. PORTADA HERO */}
        <Hero onOpenMiniQuiz={handleOpenQuiz} />

        {/* 3. CARRUSEL INFINITO DE GÉNEROS (Interactivo) */}
        <GenreStrip onSelectGenre={(g) => setTopicModal(g)} />

        {/* 4. DESAFÍA A TUS AMIGOS (CON BOTONES REALES PARA CREAR/UNIRSE A SALA) */}
        <LobbySection onOpenMiniQuiz={handleOpenQuiz} />

        {/* 5. CARACTERÍSTICAS BENTO GRID CON SPOTIFY */}
        <BentoFeatures onOpenMiniQuiz={handleOpenQuiz} />

        {/* 6. ARTISTAS FAVORITOS Y GÉNEROS (Interactivo) */}
        <ArtistSection
          onOpenMiniQuiz={handleOpenQuiz}
          onSelectArtist={(a) => setTopicModal(a)}
        />

        {/* 7. NOCHE DE JUEGOS / TRANSMISIÓN A TV */}
        <GameNightSection />

        {/* 8. ESTADÍSTICAS Y RESEÑAS */}
        <ReviewsSection />

        {/* 9. PREGUNTAS FRECUENTES (FAQ) */}
        <FaqSection />

        {/* 10. FORMULARIO DE CONTACTO */}
        <ContactSection />

        {/* 11. BANNER FINAL CTA */}
        <CtaBanner onOpenMiniQuiz={handleOpenQuiz} />
      </main>

      {/* 12. PIE DE PÁGINA */}
      <Footer onOpenMiniQuiz={handleOpenQuiz} />

      {/* MODAL JUGABLE DEL MINI-QUIZ CON SPOTIFY */}
      <MiniQuizModal
        isOpen={isQuizOpen}
        topic={quizTopic}
        customTracks={customQuizTracks}
        onClose={handleCloseQuiz}
      />

      {/* MODAL DE CONEXIÓN SPOTIFY & IMPORTADOR DE PLAYLISTS */}
      <SpotifyConnectModal
        isOpen={isSpotifyModalOpen}
        onClose={() => setIsSpotifyModalOpen(false)}
        onPlayPlaylist={(tracks, name) => handleOpenQuiz(name, tracks)}
      />

      {/* MODAL INTERACTIVO DE ELECCIÓN AL PULSAR UN ARTISTA O GÉNERO */}
      {topicModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B1710] border border-emerald-500/30 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-goblinPrimary to-goblinLime mx-auto flex items-center justify-center text-black font-black shadow-lg shadow-emerald-500/20">
              <Music2 className="w-6 h-6 text-black" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-xl text-white">{topicModal}</h3>
              <p className="text-xs text-zinc-400 mt-1">¿Cómo prefieres competir con este estilo?</p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  const t = topicModal;
                  setTopicModal(null);
                  handleOpenQuiz(t);
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow hover:opacity-95 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Gamepad2 className="w-4 h-4" />
                <span>Jugar Solo Ahora (Mini-Quiz)</span>
              </button>
              <a
                href={`/play?artist=${encodeURIComponent(topicModal)}&create=true`}
                className="w-full py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-extrabold text-xs border border-emerald-500/30 transition text-center flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Crear Sala Multijugador con este Artista</span>
              </a>
            </div>
            <button
              onClick={() => setTopicModal(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300 pt-1 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
