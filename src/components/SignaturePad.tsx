// src/components/SignaturePad.tsx
"use client";

import React, { useRef, useState, useEffect } from "react";
import { Trash2 } from "lucide-react";

interface SignaturePadProps {
  label: string;
  onSave: (base64Data: string) => void;
  savedData?: string;
}

export default function SignaturePad({ label, onSave, savedData }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions
    canvas.width = canvas.parentElement?.clientWidth || 300;
    canvas.height = 120;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#10b981"; // Emerald line
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    // If pre-existing signature data is supplied, render it
    if (savedData) {
      const img = new Image();
      img.src = savedData;
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        setHasDrawing(true);
      };
    }
  }, [savedData]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasDrawing(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasDrawing) {
      onSave(canvas.toDataURL());
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    onSave("");
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
        {hasDrawing && (
          <button
            type="button"
            onClick={clear}
            className="text-[10px] text-rose-400 hover:text-rose-350 flex items-center gap-1 transition-all"
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
          className="cursor-crosshair w-full block h-[120px]"
        />
        {!hasDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-650 text-[10px] uppercase font-mono tracking-widest">
            Sign here
          </div>
        )}
      </div>
    </div>
  );
}
