// src/app/equipment/qr/[assetId]/page.tsx
"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, QrCode, Wrench } from "lucide-react";
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

    // The QR code points to the asset's page, e.g. /equipment/LEE-PE-1904
    const scanUrl = `${window.location.origin}/equipment/${assetIdKey}`;

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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans print:bg-white print:text-black">
      {/* Header - Hidden on Print */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/equipment/${assetIdKey}`}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <QrCode className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Asset QR Label</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">
              Printable Equipment Tag
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
        >
          <Printer className="w-4 h-4" /> Print Label
        </button>
      </header>

      {/* Label Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        {/* Printable Card */}
        <div className="bg-white text-slate-900 p-8 rounded-2xl border-4 border-slate-300 shadow-2xl flex flex-col items-center text-center space-y-6 max-w-sm w-full print:border-4 print:border-black print:shadow-none print:my-0">
          {/* Logo Header */}
          <div className="flex items-center gap-2 border-b-2 border-slate-300 pb-3 w-full justify-center">
            <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-slate-900" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-slate-900 leading-none">LEE INTERNATIONAL</h2>
              <p className="text-[7px] text-slate-500 font-mono uppercase tracking-widest leading-none mt-1">
                Machinery & Services Ltd
              </p>
            </div>
          </div>

          {/* QR Code */}
          {qrUrl ? (
            <img src={qrUrl} alt={`QR Code for ${machineName}`} className="w-64 h-64 border-2 border-slate-100 p-1" />
          ) : (
            <div className="w-64 h-64 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
              Generating...
            </div>
          )}

          {/* Asset Info */}
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono leading-none">Asset ID Code</p>
            <p className="text-xl font-black text-slate-900 tracking-wide font-mono leading-none">{assetIdOriginal}</p>
            <h3 className="text-sm font-bold text-slate-800 pt-1 leading-tight">{machineName}</h3>
          </div>

          {/* Scanning Instructions */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 w-full text-[10px] text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-900">📷 Scan with Mobile Camera</p>
            <p>Access Maintenance Log, WMS, OEM specs, and raise work orders instantly.</p>
          </div>
        </div>

        {/* Print Tip (Hidden on print) */}
        <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed print:hidden">
          💡 **Print Settings Tip:** Use standard sticker layout, set size to 100%, and enable background graphics for best label results.
        </p>
      </main>
    </div>
  );
}
