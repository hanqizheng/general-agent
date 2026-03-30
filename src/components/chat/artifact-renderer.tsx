import type { UIArtifactPart } from "@/lib/chat-types";
import { stableStringifyJson } from "@/lib/artifact-types";

interface ArtifactRendererProps {
  part: UIArtifactPart;
}

function formatArtifactData(part: UIArtifactPart) {
  if (part.data === null) {
    return "Preparing structured artifact...";
  }

  try {
    return stableStringifyJson(part.data);
  } catch {
    return "Unable to serialize structured artifact data.";
  }
}

export function ArtifactRenderer({ part }: ArtifactRendererProps) {
  const title = part.contractId ?? part.artifactType ?? "Structured artifact";
  const producerLabel = part.producer
    ? part.producer.name
      ? `${part.producer.kind}:${part.producer.name}`
      : part.producer.kind
    : null;

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-sky-200 bg-sky-50/85 px-4 py-4 text-sky-950 shadow-[0_12px_30px_rgba(14,116,144,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/80">
            Structured Artifact
          </div>
          <div className="chat-text-wrap mt-1 text-sm font-semibold text-sky-950">
            {title}
          </div>
          {part.summaryText ? (
            <div className="chat-text-wrap mt-2 text-sm leading-6 text-sky-900/85">
              {part.summaryText}
            </div>
          ) : null}
        </div>

        {producerLabel ? (
          <div className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-sky-700">
            {producerLabel}
          </div>
        ) : null}
      </div>

      <details className="group mt-3">
        <summary className="flex max-w-full cursor-pointer list-none flex-wrap items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100 [&::-webkit-details-marker]:hidden">
          <span>Artifact JSON</span>
          {part.artifactType ? (
            <span className="chat-text-wrap text-sky-600/80">
              {part.artifactType}
            </span>
          ) : null}
        </summary>

        <div className="mt-2 rounded-[18px] bg-white/85 px-3 py-3">
          <pre className="chat-text-wrap max-h-96 overflow-auto text-xs leading-6 whitespace-pre-wrap text-sky-950/90">
            {formatArtifactData(part)}
          </pre>
        </div>
      </details>
    </section>
  );
}
