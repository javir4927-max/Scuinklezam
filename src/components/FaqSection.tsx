"use client";

import React, { useState } from "react";

const FAQS = [
  {
    q: "¿Es Scuinklezam realmente 100% gratis?",
    a: "¡Sí, totalmente! Jugar a Scuinklezam es y será 100% gratuito. No hay suscripciones, muros de pago ni límites de partidas diarias. Puedes jugar todas las veces que quieras con cualquier cuenta de Spotify o como invitado.",
  },
  {
    q: "¿Cómo funciona Scuinklezam?",
    a: "Scuinklezam convierte el catálogo mundial de Spotify en un emocionante juego de preguntas musicales multijugador. Elige un artista, un género o conecta tu propia cuenta de Spotify para escuchar breves fragmentos y adivinar la canción antes que nadie. Juega de forma casual o compite en la clasificación ranked de temporada.",
  },
  {
    q: "¿Necesito una cuenta de Spotify Premium para jugar?",
    a: "No, no es necesario. Puedes jugar gratis con cualquier cuenta gratuita de Spotify o incluso sin registrarte. Si tienes cuenta gratuita, escucharás fragmentos de audio de alta calidad de 15 a 30 segundos. Si cuentas con Spotify Premium, nuestro reproductor Web Playback SDK sincroniza la canción directamente en el segundo 0:30 (el estribillo más reconocible).",
  },
  {
    q: "¿Cómo funciona la función de 'Guardar en Spotify'?",
    a: "Cada vez que descubras una buena canción durante una partida o en la pantalla de resultados, pulsa el icono de Guardar Favorito. Si has conectado tu cuenta de Spotify, Scuinklezam añadirá la canción de inmediato a tu lista real de 'Canciones que te gustan' en Spotify a través de su API oficial.",
  },
  {
    q: "¿Puedo jugar desde el móvil y el ordenador?",
    a: "Sí. Scuinklezam funciona en cualquier navegador moderno: iOS, Android, macOS, Windows, Linux, o retransmitido en tu Smart TV para jugar con amigos en el salón.",
  },
  {
    q: "¿Están seguros mis datos de Spotify?",
    a: "Totalmente. Únicamente solicitamos permisos de lectura sobre tus listas y pistas favoritas para generar tus tests personalizados, y permiso para guardar canciones cuando tú decidas pulsar el botón de Favorito. Nunca guardamos contraseñas ni modificamos tu cuenta sin tu acción directa.",
  },
  {
    q: "¿Puedo crear salas privadas con amigos?",
    a: "¡Por supuesto! En la sección de Salas puedes generar un código de 4 letras (como K7QP), compartirlo con tus amigos y competir en tiempo real escuchando exactamente las mismas canciones al mismo milisegundo.",
  },
];

export default function FaqSection() {
  const [openFaqs, setOpenFaqs] = useState<Record<number, boolean>>({ 0: true });

  const toggleFaq = (idx: number) => {
    setOpenFaqs((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  return (
    <section id="faq" className="py-20 max-w-[820px] mx-auto px-4 sm:px-6">
      <div className="text-center">
        <h2 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight">
          Preguntas Frecuentes
        </h2>
        <p className="mt-3 text-zinc-300 text-base">Todo lo que necesitas saber sobre Scuinklezam y Spotify.</p>
        <p className="mt-1 text-xs text-zinc-400">
          ¿Tienes alguna otra duda? Escríbenos a{" "}
          <a href="mailto:support@scuinklezam.com" className="text-goblinLime hover:underline font-semibold">
            support@scuinklezam.com
          </a>
        </p>
      </div>

      <div className="mt-10 space-y-3">
        {FAQS.map((item, idx) => {
          const isOpen = !!openFaqs[idx];
          return (
            <div key={idx} className="glass-card rounded-2xl overflow-hidden border border-emerald-500/15">
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full px-6 py-4 text-left flex items-center justify-between font-bold text-base text-white hover:text-goblinLime transition cursor-pointer"
              >
                <span>{item.q}</span>
                <span className="text-xl text-emerald-400 font-mono transition-transform">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <div className="px-6 pb-5 text-sm text-zinc-300 leading-relaxed border-t border-emerald-500/10 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
