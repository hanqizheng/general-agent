import type { NextAuthConfig } from "next-auth";

import type { GoogleProfile } from "next-auth/providers/google";

import { env } from "@/lib/config";

export const googleEnabled = Boolean(
  env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
);

export const enabledOAuthProviders = googleEnabled
  ? (["google"] as const)
  : ([] as const);

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      const googleProfile = profile as GoogleProfile | undefined;
      return Boolean(googleProfile?.email_verified);
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.id === "string" ? token.id : String(token.sub ?? "");
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
