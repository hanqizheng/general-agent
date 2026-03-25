"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

import { parseJsonResponse } from "@/lib/client-auth";

interface RegisterFormProps {
  callbackUrl: string;
}

export function RegisterForm({ callbackUrl }: RegisterFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      await parseJsonResponse<{ success: true }>(response);

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        redirectTo: callbackUrl,
      });

      if (result?.error) {
        setError("Account created, but automatic sign-in failed.");
        setIsSubmitting(false);
        return;
      }

      window.location.href = result?.url || callbackUrl;
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to create account.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
          Create account
        </h1>
        <p className="text-sm text-stone-500">
          Register to keep your chats private and accessible across sessions.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700" htmlFor="name">
            Name
          </label>
          <input
            autoComplete="name"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
            id="name"
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </div>

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
            autoComplete="new-password"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
            id="password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        <div className="space-y-2">
          <label
            className="text-sm font-medium text-stone-700"
            htmlFor="confirmPassword"
          >
            Confirm password
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
            id="confirmPassword"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
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
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-stone-500">
        Already have an account?{" "}
        <Link
          className="font-medium text-stone-900 hover:text-emerald-600"
          href={
            callbackUrl === "/chat"
              ? "/login"
              : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
          }
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
