"use client";

const AUTH_REDIRECT_ERROR = "AUTH_REDIRECT";

export function getLoginRedirectUrl(): string {
  const callbackUrl =
    typeof window === "undefined"
      ? "/chat"
      : `${window.location.pathname}${window.location.search}`;

  const url = new URL("/login", window.location.origin);
  url.searchParams.set("callbackUrl", callbackUrl);
  return url.toString();
}

export function redirectToLogin(): never {
  window.location.assign(getLoginRedirectUrl());
  throw new Error(AUTH_REDIRECT_ERROR);
}

export function isAuthRedirectError(error: unknown): boolean {
  return error instanceof Error && error.message === AUTH_REDIRECT_ERROR;
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    redirectToLogin();
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let parsedMessage = "";
    try {
      const parsed = JSON.parse(errorText) as {
        error?: string;
        message?: string;
      };
      parsedMessage = parsed.message || parsed.error || "";
    } catch {
      parsedMessage = "";
    }
    throw new Error(
      parsedMessage || errorText || `Request failed: ${response.status}`,
    );
  }

  return (await response.json()) as T;
}
