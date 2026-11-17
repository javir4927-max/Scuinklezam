"use client";

import React, { useState } from "react";
import { Mail, Lock, User, AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import type { UserSession } from "@/lib/userAuth";

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: UserSession) => void;
}

export default function UserAuthModal({ isOpen, onClose, onSuccess }: UserAuthModalProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = tab === "login" ? "/api/auth/user/login" : "/api/auth/user/register";
      const body = tab === "login" ? { email, password } : { email, nickname, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Error al autenticar usuario.");
        return;
      }

      if (onSuccess && data.user) {
        onSuccess(data.user);
      }
      onClose();
    } catch {
      setError("Error de conexión al servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0B1710] border border-emerald-500/30 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-full cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
            <Sparkles className="w-3.5 h-3.5 text-goblinLime" />
            <span>Perfil Ranked & Guardado</span>
          </div>
          <h2 className="font-display font-black text-2xl text-white">
            {tab === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
          </h2>
          <p className="text-xs text-zinc-400">
            {tab === "login"
              ? "Guarda tu progreso Ranked y escala divisiones globales."
              : "Regístrate en 5 segundos con tu correo y nickname."}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-black/50 p-1 border border-emerald-500/20">
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              tab === "login" ? "bg-goblinPrimary text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              tab === "register" ? "bg-goblinPrimary text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Registrarse
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {tab === "register" && (
            <div>
              <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                Nickname / Nombre de Jugador
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="Tu alias en el ranking (ej. BadFan99)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/30 text-white text-xs focus:outline-none focus:border-goblinLime"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/30 text-white text-xs focus:outline-none focus:border-goblinLime"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                placeholder="Mínimo 4 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/30 text-white text-xs focus:outline-none focus:border-goblinLime"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-sm shadow-lg shadow-emerald-500/25 hover:opacity-95 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : tab === "login" ? (
              "Entrar a Scuinklezam"
            ) : (
              "Crear Cuenta y Guardar Rango"
            )}
          </button>
        </form>

        {/* Separador Spotify */}
        <div className="relative py-1 flex items-center justify-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
          <div className="w-full border-t border-emerald-500/15 absolute" />
          <span className="relative bg-[#0B1710] px-3">o continúa con</span>
        </div>

        <a
          href="/api/auth/spotify/login"
          className="w-full py-2.5 rounded-xl bg-[#102218] hover:bg-[#163022] border border-[#1DB954]/40 text-white font-bold text-xs flex items-center justify-center gap-2.5 transition"
        >
          <svg className="w-4 h-4 text-[#1DB954] fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          <span>Conectar con Spotify</span>
        </a>
      </div>
    </div>
  );
}
