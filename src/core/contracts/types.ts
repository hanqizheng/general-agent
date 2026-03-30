import type { JSONValue } from "@/lib/artifact-types";

export interface ArtifactContract {
  id: string;
  artifactType: string;
  description?: string;
  schema: Record<string, unknown>;
}

export interface StructuredArtifactResult {
  data: JSONValue;
  summaryText?: string | null;
}
