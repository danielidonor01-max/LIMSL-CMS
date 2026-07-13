// src/lib/authz.ts
// Server-side role gate for API route handlers.
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export type Actor = { id?: string; name?: string; role?: string };

// Returns the authenticated actor, or a NextResponse to return early when the
// user is unauthenticated or lacks one of the required roles.
export async function requireRoles(
  roles: string[],
): Promise<{ actor: Actor; res?: undefined } | { actor?: undefined; res: NextResponse }> {
  const session = await auth();
  const actor = session?.user as Actor | undefined;
  if (!actor) {
    return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (roles.length && !roles.includes(actor.role ?? "")) {
    return {
      res: NextResponse.json(
        { error: "You do not have permission to perform this action." },
        { status: 403 },
      ),
    };
  }
  return { actor };
}
