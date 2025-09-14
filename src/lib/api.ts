// src/lib/api.ts

// Vite の環境変数は “import.meta.env.VITE_*” の形で参照すること。
// この形だけがビルド時に静的に置換されます。
const RAW_API: string | undefined = import.meta.env.VITE_SCENE_API;

/** 末尾スラッシュや改行を除去した API ベースURL */
export const SCENE_API_BASE = (RAW_API || "").trim().replace(/\/+$/, "");

// デバッグ用ログ（本番でも害はありません）
console.log("[env] VITE_SCENE_API(raw) =", RAW_API);
console.log("[env] SCENE_API_BASE     =", SCENE_API_BASE);

/**
 * カフェ背景と合成
 * @param pngDataUrl - data:image/png;base64,... 形式
 * @param asJson - true のとき { image_data_url } を想定。false のときは画像Blobを返す
 * @returns asJson=true: { image_data_url: string } / asJson=false: { imageBlob: Blob }
 */
export async function composeScene(pngDataUrl: string, asJson = true): Promise<any> {
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
    throw new Error(`Scene API error: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }

  if (ct.includes("application/json")) {
    return await res.json(); // 期待: { image_data_url: "data:image/png;base64,..." }
  }

  if (ct.startsWith("image/")) {
    const blob = await res.blob();
    return { imageBlob: blob };
  }

  const text = await res.text().catch(() => "");
  throw new Error(`Unexpected content-type: ${ct} body:${text.slice(0, 200)}`);
}
