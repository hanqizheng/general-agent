import fs from "fs/promises";
import path from "path";

import fg from "fast-glob";
import { z } from "zod";

import { createLogger } from "@/lib/logger";

import { ArtifactContractRegistry } from "./registry";
import type { ArtifactContract } from "./types";

const logger = createLogger("artifact-contract-loader");

const ArtifactContractSchema = z.object({
  id: z.string().min(1),
  artifactType: z.string().min(1),
  description: z.string().min(1).optional(),
  schema: z.record(z.string(), z.unknown()),
});

let cachedContractsRoot: string | null = null;
let cachedRegistry: ArtifactContractRegistry | null = null;

export async function loadArtifactContracts(
  contractsRoot: string,
): Promise<ArtifactContractRegistry> {
  if (cachedRegistry && cachedContractsRoot === contractsRoot) {
    return cachedRegistry;
  }

  try {
    await fs.access(contractsRoot);
  } catch {
    logger.debug("Artifact contracts directory not found, using empty registry", {
      contractsRoot,
    });
    const emptyRegistry = new ArtifactContractRegistry();
    cachedContractsRoot = contractsRoot;
    cachedRegistry = emptyRegistry;
    return emptyRegistry;
  }

  const files = await fg("**/CONTRACT.json", {
    cwd: contractsRoot,
    absolute: true,
    onlyFiles: true,
  });

  const registry = new ArtifactContractRegistry();

  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsedJson = JSON.parse(raw) as unknown;
      const parsed = ArtifactContractSchema.safeParse(parsedJson);

      if (!parsed.success) {
        logger.warn(`Invalid artifact contract: ${filePath}`, {
          errors: parsed.error.issues,
        });
        continue;
      }

      const contract: ArtifactContract = {
        id: parsed.data.id,
        artifactType: parsed.data.artifactType,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        schema: parsed.data.schema,
      };

      registry.register(contract);
    } catch (error) {
      logger.warn(`Failed to load artifact contract: ${filePath}`, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  cachedContractsRoot = contractsRoot;
  cachedRegistry = registry;

  return registry;
}

export function getDefaultContractsRoot() {
  return path.resolve(process.cwd(), "src/core/contracts");
}
