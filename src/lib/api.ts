// src/lib/api.ts
/**
 * Viteの環境変数は必ず import.meta.env から参照する。
 * 末尾スラッシュ/改行を除去して安全に使う。
 */
const RAW_API = (import.meta as any)?.env?.VITE_SCENE_API as string | undefined;

export const SCENE_API_BASE = (RAW_API || "")
  .trim()
  .replace(/\/+$/, ""); // 末尾 / を削除

// デバッグ用（本番でも harmless）:
console.log("[env] VITE_SCENE_API(raw) =", RAW_API);
console.log("[env] SCENE_API_BASE   =", SCENE_API_BASE);

/** カフェ背景と合成（PNGを返す or dataURLを返す） */
export async function composeScene(pngDataUrl: string, asJson = false) {
  if (!SCENE_API_BASE) {
    throw new Error("VITE_SCENE_API が未設定です。");
  }
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

  if (ct.includes("application/json")) {
    return await res.json(); // { image_data_url: ... }
  }
  if (ct.startsWith("image/")) {
    const blob = await res.blob();
    return { imageBlob: blob }; // 呼び出し側で createObjectURL などに
  }

  const text = await res.text().catch(() => "");
  throw new Error(`Unexpected content-type: ${ct} body:${text.slice(0,200)}`);
}
