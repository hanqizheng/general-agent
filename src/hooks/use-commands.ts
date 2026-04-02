"use client";

import { useEffect, useState } from "react";

export interface CommandInfo {
  name: string;
  description: string;
  whenToUse: string | null;
  usage: string | null;
}

interface UseCommandsResult {
  commands: CommandInfo[];
  loading: boolean;
}

export function useCommands(): UseCommandsResult {
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/commands");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { commands: CommandInfo[] };
        if (!cancelled) {
          setCommands(data.commands);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { commands, loading };
}
