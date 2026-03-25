import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

import { db } from "@/db";
import {
  accounts,
  authSessions,
  users,
  verificationTokens,
} from "@/db/schema";

import { authConfig, googleEnabled } from "./auth.config";
import { env } from "./config";
import { normalizeEmail } from "./auth-utils";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: authSessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const rawEmail =
          typeof credentials?.email === "string" ? credentials.email : "";
        const rawPassword =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";

        const email = normalizeEmail(rawEmail);
        if (!email || !rawPassword) {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user?.passwordHash) {
          return null;
        }

        const matches = await bcrypt.compare(rawPassword, user.passwordHash);
        if (!matches) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: env.AUTH_GOOGLE_ID!,
            clientSecret: env.AUTH_GOOGLE_SECRET!,
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: normalizeEmail(profile.email),
                image: profile.picture,
                emailVerified: profile.email_verified ? new Date() : null,
              };
            },
          }),
        ]
      : []),
  ],
});
