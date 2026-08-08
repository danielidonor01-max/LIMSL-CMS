// src/middleware.ts
// Route protection via NextAuth (edge-safe config only). The `authorized`
// callback in auth.config decides which routes require a session.
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except static assets and the image optimizer.
  //
  // `sw.js` must be excluded explicitly: the service worker is fetched by the
  // browser with no session cookie context the middleware recognises, so
  // without this it is redirected to /login, never registers, and app-shell
  // caching silently does nothing.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|icon\\.svg|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest)$).*)",
  ],
};
