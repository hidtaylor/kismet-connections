import { formatDistanceToNow } from "date-fns";

export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function relTime(d?: string | null) {
  if (!d) return "—";
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function cadenceDays(c: string | null | undefined): number | null {
  switch (c) {
    case "close": return 14;
    case "monthly": return 30;
    case "quarterly": return 90;
    case "annual": return 365;
    default: return null;
  }
}

export function isOverdue(lastContactAt: string | null | undefined, cadence: string | null | undefined) {
  const days = cadenceDays(cadence);
  if (!days || !lastContactAt) return false;
  const last = new Date(lastContactAt).getTime();
  return Date.now() - last > days * 86_400_000;
}

export function highlight(text: string, query: string): { __html: string } {
  if (!query.trim()) return { __html: escapeHtml(text) };
  const re = new RegExp(`(${escapeRegex(query.trim())})`, "ig");
  const html = escapeHtml(text).replace(re, '<mark class="match-highlight">$1</mark>');
  return { __html: html };
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function snippet(text: string | null | undefined, query: string, len = 140): string {
  if (!text) return "";
  if (!query.trim()) return text.slice(0, len) + (text.length > len ? "…" : "");
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, len) + (text.length > len ? "…" : "");
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 100);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
