export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export type ArtifactProducerKind = "assistant" | "tool" | "system";

export interface ArtifactPartPayload extends Record<string, unknown> {
  artifactType: string;
  contractId?: string | null;
  producer: {
    kind: ArtifactProducerKind;
    name?: string;
  };
  data: JSONValue;
  summaryText?: string | null;
}

function sortJsonValue(value: JSONValue): JSONValue {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, JSONValue>>((acc, key) => {
        acc[key] = sortJsonValue(value[key]);
        return acc;
      }, {});
  }

  return value;
}

export function stableStringifyJson(value: JSONValue) {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

export function artifactPayloadToContextText(payload: ArtifactPartPayload) {
  const summary = payload.summaryText?.trim();
  if (summary) {
    return summary;
  }

  return stableStringifyJson(payload.data);
}
