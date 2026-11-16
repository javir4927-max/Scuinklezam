"use client";

import React, { useState } from "react";

export default function ContactSection() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormData({ name: "", email: "", message: "" });
  };

  return (
    <section id="contact" className="py-20 max-w-[1100px] mx-auto px-4 sm:px-6">
      <div className="glass-card rounded-3xl p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-12 gap-10 border border-emerald-500/20">
        <div className="lg:col-span-5 space-y-4">
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-white">
            Escríbenos
          </h2>
          <p className="text-lg font-semibold text-emerald-200">
            ¿Tienes alguna consulta o propuesta de torneos para Scuinklezam?
          </p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Ya sea que necesites asistencia para conectar Spotify, quieras proponer nuevos modos de juego o sugerir ideas, nuestro equipo estará encantado de ayudarte.
          </p>
          <div className="pt-2">
            <a
              href="mailto:support@scuinklezam.com"
              className="inline-flex items-center gap-2 text-goblinLime font-semibold text-sm hover:underline"
            >
              support@scuinklezam.com
            </a>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
              Tu Nombre *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej. Lucas o tu apodo gamer"
              className="w-full px-4 py-3 rounded-xl bg-[#08120B] border border-emerald-500/20 text-white text-sm focus:outline-none focus:border-goblinLime"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
              Correo Electrónico *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="tu@correo.com"
              className="w-full px-4 py-3 rounded-xl bg-[#08120B] border border-emerald-500/20 text-white text-sm focus:outline-none focus:border-goblinLime"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
              Mensaje *
            </label>
            <textarea
              rows={4}
              required
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="¿En qué te podemos ayudar?"
              className="w-full px-4 py-3 rounded-xl bg-[#08120B] border border-emerald-500/20 text-white text-sm focus:outline-none focus:border-goblinLime"
            ></textarea>
          </div>
          <button
            type="submit"
            className={`w-full py-3.5 rounded-full font-extrabold text-sm text-black transition cursor-pointer ${
              submitted
                ? "bg-emerald-400"
                : "bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 shadow-lg shadow-emerald-500/25"
            }`}
          >
            {submitted ? "Mensaje Enviado ✓" : "Enviar Mensaje"}
          </button>
          <p
            className={`text-xs text-center ${
              submitted ? "text-goblinLime font-semibold" : "text-zinc-400"
            }`}
          >
            {submitted
              ? "¡Gracias por contactarnos! Te responderemos en menos de 24 horas."
              : "Te responderemos lo más rápido posible. Habitualmente en menos de 24 horas."}
          </p>
        </form>
      </div>
    </section>
  );
}
