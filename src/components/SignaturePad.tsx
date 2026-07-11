// src/components/SignaturePad.tsx
"use client";

import { useEffect, useRef } from "react";
import SignaturePadLib from "signature_pad";
import { Eraser } from "lucide-react";

// Canvas-based drawn signature. Emits a PNG data URL on every stroke end,
// and null when cleared.
export default function SignaturePad({
  label,
  onChange,
}: {
  label: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      ctx?.scale(ratio, ratio);
      padRef.current?.clear();
    };

    const pad = new SignaturePadLib(canvas, {
      penColor: "#f1f5f9",
      backgroundColor: "rgba(0,0,0,0)",
      minWidth: 0.7,
      maxWidth: 2.2,
    });
    padRef.current = pad;

    pad.addEventListener("endStroke", () => {
      onChange(pad.isEmpty() ? null : pad.toDataURL("image/png"));
    });

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = () => {
    padRef.current?.clear();
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-400"
        >
          <Eraser className="w-3 h-3" /> Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-32 bg-slate-900/60 border border-slate-700 rounded-lg touch-none cursor-crosshair"
      />
      <p className="text-[10px] text-slate-500 mt-1">Sign above with mouse or finger</p>
    </div>
  );
}
