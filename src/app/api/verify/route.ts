// src/app/api/verify/route.ts
// Checking a printed document against the record it came from.
//
// Authenticated, like everything else. A public endpoint would let anybody
// holding a code learn that a permit exists, who it names and when it was
// signed, and a permit register is not public information. Somebody outside
// LIMSL who needs to verify a document asks LIMSL, and this is what LIMSL uses
// to answer them in front of them.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { normaliseCode } from "@/lib/verification";
import { verifySeal, SEAL_LABEL, SEAL_HREF, type SealableType } from "@/lib/signoff/seal";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code") ?? "";

  const code = normaliseCode(raw);
  if (!code) {
    return NextResponse.json(
      { status: "MALFORMED", message: "That is not a document code. They read LEE-XXXX-XXXX." },
      { status: 200 },
    );
  }

  try {
    const result = await verifySeal(code);

    if (!result.found) {
      // Not the same as "altered", and the wording has to keep them apart. This
      // one is almost always a typo.
      return NextResponse.json({
        status: "NOT_FOUND",
        code,
        message: "No document carries this code. Check the code on the sheet and try again.",
      });
    }

    const kind = SEAL_LABEL[result.entityType as SealableType] ?? result.entityType;
    return NextResponse.json({
      status: result.verdict.status,
      code,
      kind,
      reference: result.reference,
      sealedAt: result.sealedAt,
      href: SEAL_HREF[result.entityType as SealableType]?.(result.entityId) ?? null,
      message:
        result.verdict.status === "MATCHES"
          ? "This document matches the record it was signed against."
          : "This document does NOT match the record. Either the sheet was altered after printing, or the record was changed after it was signed.",
    });
  } catch (error) {
    console.error("Verification failed:", error);
    return NextResponse.json({ error: "Could not check that code" }, { status: 500 });
  }
}
