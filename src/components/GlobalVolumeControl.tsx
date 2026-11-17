"use client";

import React from "react";
import { Volume2, Volume1, VolumeX } from "lucide-react";
import { useGlobalVolume } from "@/lib/globalVolume";

interface GlobalVolumeControlProps {
  className?: string;
  compact?: boolean;
}

export default function GlobalVolumeControl({
  className = "",
  compact = false,
}: GlobalVolumeControlProps) {
  const { volume, muted, effectiveVolume, setVolume, toggleMute } = useGlobalVolume();

  const isSilent = muted || volume === 0;

  return (
    <div
      className={`flex items-center gap-2 bg-zinc-900/60 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5 transition-all hover:bg-zinc-800/80 hover:border-white/20 shadow-sm ${className}`}
    >
      <button
        type="button"
        onClick={toggleMute}
        className="text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0"
        title={isSilent ? "Activar sonido" : "Silenciar sonido"}
        aria-label={isSilent ? "Activar sonido" : "Silenciar sonido"}
      >
        {isSilent ? (
          <VolumeX className="w-4 h-4 text-zinc-400" />
        ) : effectiveVolume < 0.5 ? (
          <Volume1 className="w-4 h-4 text-emerald-400" />
        ) : (
          <Volume2 className="w-4 h-4 text-emerald-400" />
        )}
      </button>

      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={effectiveVolume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        className={`h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(16,185,129,0.7)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 ${
          compact ? "w-16" : "w-20 sm:w-24"
        }`}
        title={`Volumen: ${Math.round(effectiveVolume * 100)}%`}
        aria-label="Control de volumen general"
      />
    </div>
  );
}
