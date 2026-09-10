// src/app/api/verify/seal/route.ts
// The seal on one record, so its printed sheet can carry the code.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sealFor } from "@/lib/signoff/seal";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  try {
    const seal = await sealFor(entityType, entityId);
    // Null is a normal answer, not an error: a document that is not fully
    // signed yet has nothing to seal.
    return NextResponse.json({ seal });
  } catch (error) {
    console.error("Failed to read the document seal:", error);
    return NextResponse.json({ error: "Could not read the seal" }, { status: 500 });
  }
}
