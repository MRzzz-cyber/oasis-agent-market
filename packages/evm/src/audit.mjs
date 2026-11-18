import { createHash } from "node:crypto";

const entries = [];

export function writeAuditRecord({ requestId, decision, payment }) {
  const messageHash = createHash("sha256").update(JSON.stringify({ requestId, decision, payment })).digest("hex");
  const entry = {
    mode: "local", status: "recorded", requestId, messageHash, recordedAt: new Date().toISOString()
  };
  entries.push(entry);
  if (entries.length > 256) entries.shift();
  return entry;
}

export function fetchAuditMessages({ limit = 20, order = "desc" } = {}) {
  const count = Number(limit);
  const ordered = order === "asc" ? entries : [...entries].reverse();
  return { mode: "local", messages: ordered.slice(0, Number.isInteger(count) && count > 0 ? Math.min(count, 256) : 20) };
}
