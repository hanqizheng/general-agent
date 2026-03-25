import { NextRequest, NextResponse } from "next/server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { genUserId } from "@/lib/id";

import { normalizeEmail } from "@/lib/auth-utils";

export const runtime = "nodejs";

const registerBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = registerBodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    return NextResponse.json(
      {
        error: "EMAIL_EXISTS",
        message: "An account already exists for this email address.",
      },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await db.insert(users).values({
    id: genUserId(),
    name: parsed.data.name.trim(),
    email,
    passwordHash,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
