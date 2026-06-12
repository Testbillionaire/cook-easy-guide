// localStorage-backed ZIP for analytics enrichment.
const KEY = "pantry.zip";
export function getZip(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY) ?? "";
}
export function setZip(v: string) {
  if (typeof window === "undefined") return;
  const z = v.trim();
  if (z) window.localStorage.setItem(KEY, z);
  else window.localStorage.removeItem(KEY);
}
