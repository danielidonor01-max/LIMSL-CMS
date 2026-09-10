// src/auth.config.ts
// Edge-safe NextAuth config (no database / Node-only imports). Used by the
// middleware for route protection; the full config in auth.ts adds the
// Credentials provider that touches the database.
import type { NextAuthConfig } from "next-auth";
import { publicScanRedirect } from "@/lib/scan-redirect";

// `/offline` is served by the service worker when there is no connection. It is
// public because the session cannot be checked with the network down, and
// redirecting to /login at that moment would show a sign-in form that cannot
// possibly submit.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/equipment/qr",
  "/equipment/scan",
  "/api/equipment/scan",
  "/offline",
  "/forgot-password",
  "/reset-password",
  "/account/confirm-email",
];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic = PUBLIC_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (isPublic) return true;
      if (!auth?.user) {
        // Somebody scanned a sticker. Stickers outlive code: this label has
        // encoded three different URLs over its life and all three are on
        // machines right now, so the rule is by ASSET rather than by path.
        // Showing a login form to a welder who scanned a code to find out
        // whether a machine is safe to touch is the failure this prevents.
        const passport = publicScanRedirect(pathname);
        if (passport) return Response.redirect(new URL(passport, request.nextUrl));
        return false;
      }

      const user = auth.user as { mustChangePassword?: boolean };
      if (user.mustChangePassword) {
        if (pathname !== "/change-password" && pathname !== "/api/users/change-password") {
          return Response.redirect(new URL("/change-password", request.nextUrl));
        }
      }
      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.uid = (user as { id?: string }).id;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword;
      }
      if (trigger === "update" && session) {
        if (typeof session.mustChangePassword === "boolean") {
          token.mustChangePassword = session.mustChangePassword;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // Normalise the legacy "ADMIN" role (from the original seed) to the
        // canonical SUPER_ADMIN here, at the one boundary roles enter the app,         // so an older/stale session is never half-broken without a re-login.
        const raw = token.role as string;
        (session.user as { role?: string }).role = raw === "ADMIN" ? "SUPER_ADMIN" : raw;
        (session.user as { id?: string }).id = token.uid as string;
        (session.user as { mustChangePassword?: boolean }).mustChangePassword = !!token.mustChangePassword;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
