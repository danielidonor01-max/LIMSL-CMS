// src/app/equipment/qr/[assetId]/page.tsx
"use client";

import Button from "@/components/Button";
import { use, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, QrCode, Wrench } from "lucide-react";
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

    // The QR points at the ACTION screen, not the record. Whoever scans this
    // label is standing at the machine with one job in mind, asking them what
    // they came to do beats opening a four-tab desktop page on a phone.
    const scanUrl = `${window.location.origin}/equipment/${assetIdKey}/do`;

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
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-ink-900">Asset QR Label</h1>
            <p className="text-[11px] text-brand-600 font-mono tracking-wider uppercase">
              Printable Equipment Tag
            </p>
          </div>
        </div>

        <Button
          onClick={handlePrint}
        >
          <Printer className="w-4 h-4" /> Print Label
        </Button>
      </header>

      {/* Label Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        {/* Printable Card */}
        <div className="bg-white text-ink-900 p-8 rounded-2xl border-4 border-ink-300 shadow-2xl flex flex-col items-center text-center space-y-8 max-w-sm w-full print:border-4 print:border-black print:shadow-none print:my-0">
          {/* Logo Header */}
          <div className="flex items-center gap-2 border-b-2 border-ink-300 pb-3 w-full justify-center">
            <div className="w-8 h-8 rounded bg-ink-100 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-ink-900" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-ink-900 leading-none">LEE INTERNATIONAL</h2>
              <p className="text-[10px] text-ink-500 font-mono uppercase tracking-widest leading-none mt-1">
                Machinery & Services Ltd
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

          {/* Scanning Instructions */}
          <div className="bg-ink-50 border border-ink-200 rounded-lg p-2.5 w-full text-[11px] text-ink-600 leading-relaxed">
            <p className="font-bold text-ink-900">📷 Scan with Mobile Camera</p>
            <p>Access Maintenance Log, WMS, OEM specs, and raise work orders instantly.</p>
          </div>
        </div>

        {/* Print Tip (Hidden on print) */}
        <p className="text-xs text-ink-500 text-center max-w-xs leading-relaxed print:hidden">
          💡 **Print Settings Tip:** Use standard sticker layout, set size to 100%, and enable background graphics for best label results.
        </p>
      </main>
    </div>
  );
}
