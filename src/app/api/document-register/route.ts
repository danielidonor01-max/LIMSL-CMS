// src/app/api/document-register/route.ts
// The document control register: every numbered record and what it traces to.
// Read-only; any signed-in person who can open the page can read it.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildRegister } from "@/lib/document-register";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ rows: await buildRegister() });
  } catch (err) {
    console.error("document register failed", err);
    return NextResponse.json({ error: "Could not load the document register" }, { status: 500 });
  }
}
