// lib/api.ts
const API_BASE = (import.meta.env.VITE_SCENE_API || "").trim().replace(/\/$/, "");

export async function composeScene(pngDataUrl: string) {
  if (!API_BASE) throw new Error("VITE_SCENE_API が未設定です。");
  const res = await fetch(`${API_BASE}/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: pngDataUrl }),
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (ct.includes("application/json")) return await res.json();
  if (ct.startsWith("image/")) return { imageBlob: await res.blob() };
  throw new Error(`Unexpected content-type: ${ct}`);
}
