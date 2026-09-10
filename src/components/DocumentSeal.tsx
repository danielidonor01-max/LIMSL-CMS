// src/components/DocumentSeal.tsx
// The verification block at the foot of a printed document.
//
// A sheet that has left the building can be edited in Word and reprinted, and
// nothing on the paper would say so. This block is how somebody holding it
// checks: type the code, or scan the square, and the system says whether the
// record still matches what was signed.
//
// It renders nothing at all until the document is fully signed. A code on a
// draft would be checked, found not to match a completed record, and reported
// as tampering, which is worse than having no code.
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Seal = { code: string; sealedAt: string } | null;

export default function DocumentSeal({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [seal, setSeal] = useState<Seal>(null);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/verify/seal?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : { seal: null }))
      .then(async (d) => {
        if (cancelled || !d.seal) return;
        setSeal(d.seal);
        const url = `${window.location.origin}/verify?code=${encodeURIComponent(d.seal.code)}`;
        // Black on white and a wide margin: this is printed small, often on a
        // tired workshop printer, and read by a phone camera in bad light.
        const data = await QRCode.toDataURL(url, {
          width: 220,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!cancelled) setQr(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (!seal) return null;

  return (
    <div className="mt-6 pt-3 border-t-2 border-black flex items-start justify-between gap-4 print-avoid-break">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest">Document verification</p>
        <p className="text-lg font-black tracking-[0.12em] tabular-nums mt-1">{seal.code}</p>
        <p className="text-[9px] leading-snug mt-1 max-w-xs">
          Check this sheet against the record at the Check a Document page in LIMSL CMS, or scan the
          code. A mismatch means the sheet or the record changed after it was signed.
        </p>
      </div>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`Verification code ${seal.code}`} className="w-20 h-20 shrink-0" />
      )}
    </div>
  );
}
