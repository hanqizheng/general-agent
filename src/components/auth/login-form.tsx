"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getProviders, signIn } from "next-auth/react";

interface LoginFormProps {
  callbackUrl: string;
  error: string | null;
}

function getAuthErrorMessage(error: string | null) {
  switch (error) {
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "OAuthAccountNotLinked":
      return "This email is already linked to a different sign-in method.";
    case "AccessDenied":
      return "Sign in requires a verified Google account.";
    default:
      return error ? "Unable to sign in." : null;
  }
}

export function LoginForm({ callbackUrl, error: routeError }: LoginFormProps) {
  const initialError = useMemo(
    () => getAuthErrorMessage(routeError),
    [routeError],
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleEnabled, setIsGoogleEnabled] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    let cancelled = false;

    const loadProviders = async () => {
      const providers = await getProviders().catch(() => null);
      if (!cancelled) {
        setIsGoogleEnabled(Boolean(providers?.google));
      }
    };

    void loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      redirectTo: callbackUrl,
    });

    if (result?.error) {
      setError(getAuthErrorMessage(result.error));
      setIsSubmitting(false);
      return;
    }

    window.location.href = result?.url || callbackUrl;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
          Sign in
        </h1>
        <p className="text-sm text-stone-500">
          Access your private chat history and continue where you left off.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>

        <div className="space-y-2">
          <label
            className="text-sm font-medium text-stone-700"
            htmlFor="password"
          >
            Password
          </label>
          <input
            autoComplete="current-password"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        {error ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        ) : null}

        <button
          className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in with password"}
        </button>
      </form>

      {isGoogleEnabled ? (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-200" />
            <span className="text-xs uppercase tracking-[0.24em] text-stone-400">
              or continue with
            </span>
            <div className="h-px flex-1 bg-stone-200" />
          </div>

          <button
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            onClick={() => {
              void signIn("google", { redirectTo: callbackUrl });
            }}
            type="button"
          >
            Continue with Google
          </button>
        </>
      ) : null}

      <p className="text-center text-sm text-stone-500">
        Don&apos;t have an account?{" "}
        <Link
          className="font-medium text-stone-900 hover:text-emerald-600"
          href={
            callbackUrl === "/chat"
              ? "/register"
              : `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
          }
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
