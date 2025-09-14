// src/lib/api.ts
const RAW_API = (import.meta as any)?.env?.VITE_SCENE_API as string | undefined;

export const SCENE_API_BASE = (RAW_API || "").trim().replace(/\/+$/, "");

console.log("[env] VITE_SCENE_API(raw) =", RAW_API);
console.log("[env] SCENE_API_BASE     =", SCENE_API_BASE);

export async function composeScene(pngDataUrl: string, asJson = true) {
  if (!SCENE_API_BASE) throw new Error("VITE_SCENE_API が未設定です。");
  const url = `${SCENE_API_BASE}/compose${asJson ? "?format=json" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: pngDataUrl }),
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scene API error: ${res.status} ${res.statusText} ${text.slice(0,200)}`);
  }
  if (ct.includes("application/json")) return await res.json();
  if (ct.startsWith("image/")) return { imageBlob: await res.blob() };
  const text = await res.text().catch(() => "");
  throw new Error(`Unexpected content-type: ${ct} body:${text.slice(0,200)}`);
}
