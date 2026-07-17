// src/app/api/files/[...key]/route.ts
// Auth-gated file serving. Any authenticated user may view a stored file (the
// middleware already requires a session). Local files are streamed; cloud files
// redirect to a short-lived signed URL. Compliance documents are therefore never
// exposed as public URLs.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { serveFile } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  const joined = (key ?? []).join("/");
  const result = await serveFile(joined);

  if (result.kind === "notfound") {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (result.kind === "redirect") {
    return NextResponse.redirect(result.url);
  }
  return new NextResponse(result.body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `inline; filename="${result.name}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
