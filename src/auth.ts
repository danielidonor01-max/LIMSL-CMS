// src/auth.ts
// Full NextAuth setup (Node runtime): Credentials provider validating against
// the users table. Exports handlers for the route, and auth/signIn/signOut.
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { isLockedOut, recentFailures, recordFailure } from "@/lib/auth/guess-limit";

// The login page reads this code to say the account is locked, rather than
// "wrong password" to somebody who may have typed the right one.
class SignInLocked extends CredentialsSignin {
  code = "locked";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Role and active status are read from the database on every request, not
    // only at sign-in. Otherwise a deactivated leaver, or somebody moved out of
    // a manager's role, kept signing documents as before until their session
    // ran out. Returning null ends the session there and then.
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      if (params.user) return token;
      const uid = token.uid as string | undefined;
      if (!uid) return null;
      try {
        const [u] = await db
          .select({ role: users.role, isActive: users.isActive, mustChangePassword: users.mustChangePassword })
          .from(users)
          .where(eq(users.id, uid))
          .limit(1);
        if (!u || u.isActive === false) return null;
        token.role = u.role;
        token.mustChangePassword = !!u.mustChangePassword;
      } catch (err) {
        // A database that cannot be reached cannot serve the request either;
        // signing everybody out over a dropped connection would be worse.
        console.warn("auth: could not re-check the account", err);
      }
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email ? String(credentials.email).toLowerCase() : "";
        const password = credentials?.password ? String(credentials.password) : "";
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || user.isActive === false) return null;

        // Checked before the password, so the right password does not get in
        // while the account is locked either.
        const failures = await recentFailures(user.id, "LOGIN_FAILED");
        if (isLockedOut(failures)) throw new SignInLocked();

        if (!verifyPassword(password, user.passwordHash)) {
          await recordFailure(user, "LOGIN_FAILED", failures + 1);
          if (isLockedOut(failures + 1)) throw new SignInLocked();
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: !!user.mustChangePassword,
        };
      },
    }),
  ],
});
