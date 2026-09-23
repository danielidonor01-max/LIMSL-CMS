// src/components/SignatureBlock.tsx
// What a signature looks like once it has been given.
//
// It used to be a picture of a scrawl drawn with a fingertip on a tablet, and
// that image was doing none of the work anybody thought it was. A finger-drawn
// mark is not comparable to a wet signature, cannot be verified against
// anything, and on a 90px-wide thumbnail it was unreadable in the one place it
// mattered: the printed permit an inspector reads.
//
// What actually carries the evidence was always the record around it — the
// authenticated user id, the name, the role, the timestamp, the audit row, and
// the PIN where the signer has chosen to set one. So the mark states those
// instead, the way Adobe and every other document system states them: who,
// what they were acting as, and exactly when.
//
// Drawn signatures already in the database still render. A record signed in
// August must look the same in five years as it did on the day; a migration
// that quietly redrew historical signatures would be rewriting evidence.
"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";

/** Long form, because a signature's date is read once and must not be ambiguous. */
export function formatSignedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function SignatureBlock({
  name,
  role,
  signedAt,
  drawn,
  compact = false,
  className = "",
}: {
  name: string | null | undefined;
  /** The role they signed AS, which is not always the role they hold. */
  role?: string | null;
  signedAt?: string | null;
  /** A historical drawn mark. Shown above the attribution when one exists. */
  drawn?: string | null;
  /** Inline in a table row rather than on a signature line. */
  compact?: boolean;
  className?: string;
}) {
  const who = (name ?? "").trim() || "Unknown signer";
  const roleLabel = role ? ROLE_LABELS[role] ?? role : null;
  const when = formatSignedAt(signedAt);

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
        <Check className="w-3.5 h-3.5 shrink-0 text-brand-600" aria-hidden="true" />
        <span className="truncate text-xs text-ink-700">
          <span className="font-semibold text-ink-900">{who}</span>
          {when ? <span className="text-ink-500"> · {when}</span> : null}
        </span>
      </span>
    );
  }

  return (
    <figure className={`inline-block min-w-0 ${className}`}>
      {/* The drawn mark, where a historical record has one. New signatures do
          not create these; nothing is deleted that already did. */}
      {drawn && (
        <Image
          src={drawn}
          alt={`Signature of ${who}`}
          width={132}
          height={44}
          unoptimized
          className="h-10 w-auto mb-1"
        />
      )}
      {/* The name set in the display face, which is what makes this read as a
          signature rather than as a table cell. */}
      <figcaption className="border-l-2 border-brand-500 pl-2.5">
        <span className="block font-display text-base text-ink-900 leading-tight truncate">{who}</span>
        {roleLabel && <span className="block text-xs text-ink-600 leading-tight mt-0.5">{roleLabel}</span>}
        {when && (
          <span className="block text-xs text-ink-500 leading-tight mt-0.5 tabular-nums">
            Signed {when}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
