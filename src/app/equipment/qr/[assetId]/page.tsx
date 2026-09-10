// src/app/equipment/qr/[assetId]/page.tsx
"use client";

import Button from "@/components/Button";
import { use, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Printer, Smartphone, ExternalLink } from "lucide-react";
import QRCode from "qrcode";

export default function QRPrintPage({ params }: { params: Promise<{ assetId: string }> }) {
  const resolvedParams = use(params);
  const assetIdKey = resolvedParams.assetId; // E.g., LEE-PE-1904
  const assetIdOriginal = assetIdKey.replace(/-/g, "/"); // Convert back to LEE/PE/1904
  const [qrUrl, setQrUrl] = useState("");
  const [machineName, setMachineName] = useState("");

  useEffect(() => {
    // Fetch the real machine name so the label is correct for every asset, not
    // just a hardcoded handful.
    fetch(`/api/equipment/${assetIdKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMachineName(d?.name || "LIMSL Production Asset"))
      .catch(() => setMachineName("LIMSL Production Asset"));

    // The QR code points to the public machine status passport page, e.g. /equipment/scan/LEE-PE-1904
    // Anyone on site can scan to view live machine status without logging in, then sign in for technical controls.
    const scanUrl = `${window.location.origin}/equipment/scan/${assetIdKey}`;

    QRCode.toDataURL(
      scanUrl,
      {
        width: 300,
        margin: 2,
        color: {
          dark: "#0b0f19",
          light: "#ffffff",
        },
      },
      (err, url) => {
        if (!err) setQrUrl(url);
      }
    );
  }, [assetIdKey, assetIdOriginal]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans print:bg-white print:text-black">
      {/* Header - Hidden on Print */}
      <header className="border-b border-ink-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/equipment/${assetIdKey}`}
            className="p-2 hover:bg-ink-100 rounded-lg text-ink-500 hover:text-ink-900 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-ink-900">Asset QR label</h1>
            <p className="text-xs text-ink-600 mt-0.5">
              Print and fix to {assetIdOriginal}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/equipment/scan/${assetIdKey}`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold transition-all border border-slate-300"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> Preview Mobile Scan <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Print Label
          </Button>
        </div>
      </header>

      {/* Label Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        {/* Printable Card */}
        <div className="bg-white text-ink-900 p-8 rounded-2xl border-4 border-ink-300 shadow-2xl flex flex-col items-center text-center space-y-8 max-w-sm w-full print:border-4 print:border-black print:shadow-none print:my-0">
          {/* Letterhead. The company mark, not a generic tool glyph: this label
              is stuck to a machine and is the only thing on it saying whose
              asset it is. An <img> also survives printing, where the tinted box
              it replaced was a background and would have come out blank unless
              the operator remembered to enable background graphics. */}
          <div className="flex items-center gap-2.5 border-b-2 border-ink-300 pb-3 w-full justify-center">
            <Image
              src="/brand/logo-80.png"
              alt=""
              width={36}
              height={36}
              priority
              className="w-9 h-9 object-contain shrink-0"
            />
            <div className="text-left">
              <h2 className="text-sm font-black tracking-tight text-ink-900 leading-none">LEE INTERNATIONAL</h2>
              <p className="text-[10px] text-ink-500 font-mono uppercase tracking-widest leading-none mt-1">
                Machinery &amp; Services Limited
              </p>
            </div>
          </div>

          {/* QR Code */}
          {qrUrl ? (
            <img src={qrUrl} alt={`QR Code for ${machineName}`} className="w-64 h-64 border-2 border-ink-100 p-1" />
          ) : (
            <div className="w-64 h-64 bg-ink-100 rounded-lg flex items-center justify-center text-ink-500">
              Generating...
            </div>
          )}

          {/* Asset Info */}
          <div className="space-y-1">
            <p className="text-[11px] text-ink-500 uppercase tracking-widest font-mono leading-none">Asset ID Code</p>
            <p className="text-xl font-black text-ink-900 tracking-wide font-mono leading-none">{assetIdOriginal}</p>
            <h3 className="text-sm font-bold text-ink-800 pt-1 leading-tight">{machineName}</h3>
          </div>

          {/* Scanning instructions */}
          <div className="bg-ink-50 border border-ink-200 rounded-lg p-2.5 w-full text-[11px] text-ink-600 leading-relaxed">
            <p className="font-bold text-ink-900">Scan with a phone camera</p>
            <p>Live Machine Status, ISO 45001 Safety Clearance, and Maintenance Login.</p>
          </div>
        </div>

        {/* Print tip */}
        <p className="text-xs text-ink-500 text-center max-w-xs leading-relaxed print:hidden">
          <strong className="text-ink-700">Printing:</strong> use a standard sticker layout at 100% scale. The
          label needs no background graphics.
        </p>
      </main>
    </div>
  );
}
