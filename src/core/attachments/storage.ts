import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/config";

function getAttachmentsRoot() {
  const baseDir = env.ARTIFACTS_DIR
    ? path.resolve(env.ARTIFACTS_DIR)
    : path.resolve(process.cwd(), ".artifacts");

  return path.join(baseDir, "attachments");
}

function sanitizeExtension(originalName: string | null) {
  const extension = originalName ? path.extname(originalName).toLowerCase() : "";
  return extension === ".pdf" ? extension : ".pdf";
}

export async function writeAttachmentFile(
  attachmentId: string,
  content: Uint8Array,
  originalName: string | null,
) {
  const root = getAttachmentsRoot();
  await mkdir(root, { recursive: true });

  const storageKey = `${attachmentId}${sanitizeExtension(originalName)}`;
  await writeFile(path.join(root, storageKey), content);
  return storageKey;
}

export function resolveAttachmentStoragePath(storageKey: string) {
  return path.join(getAttachmentsRoot(), storageKey);
}

export async function readAttachmentFile(storageKey: string) {
  return readFile(resolveAttachmentStoragePath(storageKey));
}

export async function removeAttachmentFile(storageKey: string | null) {
  if (!storageKey) {
    return;
  }

  await rm(resolveAttachmentStoragePath(storageKey), {
    force: true,
  });
}
