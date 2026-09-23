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
  /** Marked the way Field marks it, so a required signature reads the same as
   *  a required text field rather than as an asterisk somebody typed. */
  required?: boolean;
  onSave?: (base64Data: string) => void;
  onChange?: (dataUrl: string | null) => void;
  savedData?: string;
}

export default function SignaturePad({ label, required, onSave, onChange, savedData }: SignaturePadProps) {
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

    // Ink, not brand green. A signature is a mark made with a pen, and drawing
    // it in the accent colour made the one legally-weighted thing on the page
    // read as a decorative flourish. This is --color-ink-900; it cannot be a
    // token class because the canvas is painted, not styled.
    ctx.strokeStyle = "#181a19";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

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
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline gap-3">
        <span className="text-sm font-medium text-ink-700">
          {label}
          {required && <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>}
        </span>
        {hasDrawing && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-ink-500 hover:text-danger-600 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* White, like paper. It used to be a grey field, which reads as a
          disabled input rather than as somewhere to make a mark. The ruled
          line is what tells you where to sign, so the placeholder does not
          have to shout it in tracked-out capitals. */}
      <div className="border border-ink-200 rounded-lg overflow-hidden bg-surface relative">
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
          <div className="absolute inset-x-6 bottom-8 pointer-events-none">
            <div className="border-b border-ink-200" />
            <p className="text-xs text-ink-400 mt-1.5">Sign here</p>
          </div>
        )}
      </div>
    </div>
  );
}
