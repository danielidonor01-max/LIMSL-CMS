// src/components/SignaturePad.tsx
"use client";

import React, { useRef, useState, useEffect } from "react";
import { Trash2 } from "lucide-react";

// Unified canvas-based drawn signature used across every sign-off flow.
// Supports both call conventions so all modules share one component:
//   • Phase 3/4 (WMS, corrective):  <SignaturePad onSave={setSig} savedData={sig} />
//   • Phase 2 (PM checklist):        <SignaturePad onChange={setSig} />
// On every completed stroke it emits the PNG data URL through whichever
// callback(s) are provided; clearing emits "" (onSave) and null (onChange).
interface SignaturePadProps {
  label: string;
  onSave?: (base64Data: string) => void;
  onChange?: (dataUrl: string | null) => void;
  savedData?: string;
}

export default function SignaturePad({ label, onSave, onChange, savedData }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  const emit = (data: string) => {
    onSave?.(data);
    onChange?.(data === "" ? null : data);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvas.parentElement?.clientWidth || 300;
    canvas.height = 120;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#10b981"; // Emerald line
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    // Render a pre-existing signature if supplied (edit/review flows)
    if (savedData) {
      const img = new Image();
      img.src = savedData;
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        setHasDrawing(true);
      };
    }
  }, [savedData]);

  const coords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = coords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = coords(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawing(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasDrawing) emit(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    emit("");
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
        {hasDrawing && (
          <button
            type="button"
            onClick={clear}
            className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Signature
          </button>
        )}
      </div>

      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/80 relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="cursor-crosshair w-full block h-[120px] touch-none"
        />
        {!hasDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-500 text-[10px] uppercase font-mono tracking-widest">
            Sign here
          </div>
        )}
      </div>
    </div>
  );
}
