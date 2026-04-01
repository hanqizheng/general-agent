import { NextResponse } from "next/server";
import path from "path";

import { loadCommands } from "@/core/skills";
import { requireUserId } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireUserId();

  const commandsRoot = path.resolve(process.cwd(), "src/skills");
  const commands = (await loadCommands(commandsRoot))
    .filter((command) => command.userInvocable)
    .map((command) => ({
      name: command.name,
      description: command.description,
      whenToUse: command.whenToUse,
      usage: command.usage,
    }));

  return NextResponse.json({ commands });
}
