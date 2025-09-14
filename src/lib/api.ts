// src/lib/api.ts
const RAW_API: string | undefined = import.meta.env.VITE_SCENE_API;
export const SCENE_API_BASE = (RAW_API || "").trim().replace(/\/+$/, "");

console.log("[env] VITE_SCENE_API(raw) =", RAW_API);
console.log("[env] SCENE_API_BASE     =", SCENE_API_BASE);

type ComposeJsonResponse = { image_data_url: string };
type ComposeBlobResponse = { imageBlob: Blob };

type ComposeParams = {
  /** data:image/png;base64,... （透過推奨） */
  pngDataUrl: string;
  /** サーバ側がシーン切替を受ける場合に備える */
  scene?: string; // 例: "cafe-1"
  /** JSON優先（既定true）。失敗時はフォームデータに自動フォールバック */
  preferJson?: boolean;
};

async function postJson({ pngDataUrl, scene }: { pngDataUrl: string; scene?: string }) {
  const url = `${SCENE_API_BASE}/compose?format=json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: pngDataUrl, scene }),
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Scene API(JSON) ${res.status} ${res.statusText} ${t.slice(0, 200)}`);
  }
  if (!ct.includes("application/json")) {
    const t = await res.text().catch(() => "");
    throw new Error(`Unexpected JSON content-type: ${ct} body:${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as ComposeJsonResponse;
  if (!json?.image_data_url) throw new Error("JSON payload missing image_data_url");
  return json;
}

async function postForm({ pngDataUrl, scene }: { pngDataUrl: string; scene?: string }) {
  const url = `${SCENE_API_BASE}/compose`;
  const form = new FormData();
  // フィールド名を "bag" に。サーバ側でよくある想定名。
  // dataURL→Blobに変換して送る
  const blob = await (await fetch(pngDataUrl)).blob();
  form.append("bag", blob, "bag.png");
  if (scene) form.append("scene", scene);

  const res = await fetch(url, { method: "POST", body: form });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Scene API(FORM) ${res.status} ${res.statusText} ${t.slice(0, 200)}`);
  }
  if (ct.startsWith("image/")) {
    const b = await res.blob();
    return { imageBlob: b } as ComposeBlobResponse;
  }
  if (ct.includes("application/json")) {
    const j = (await res.json()) as ComposeJsonResponse;
    if (!j?.image_data_url) throw new Error("JSON payload missing image_data_url");
    return j;
  }
  const t = await res.text().catch(() => "");
  throw new Error(`Unexpected FORM content-type: ${ct} body:${t.slice(0, 200)}`);
}

/**
 * 背景と袋PNGを合成して画像を返す（JSON→FORMの順でフォールバック）
 */
export async function composeScene(
  { pngDataUrl, scene, preferJson = true }: ComposeParams
): Promise<ComposeJsonResponse | ComposeBlobResponse> {
  if (!SCENE_API_BASE) throw new Error("VITE_SCENE_API が未設定です。");
  if (!pngDataUrl.startsWith("data:image/png")) {
    throw new Error("pngDataUrl が PNG の dataURL ではありません。");
  }

  if (preferJson) {
    try {
      return await postJson({ pngDataUrl, scene });
    } catch (e) {
      console.warn("[composeScene] JSON送信に失敗。FORMにフォールバックします。", e);
      return await postForm({ pngDataUrl, scene });
    }
  } else {
    try {
      return await postForm({ pngDataUrl, scene });
    } catch (e) {
      console.warn("[composeScene] FORM送信に失敗。JSONにフォールバックします。", e);
      return await postJson({ pngDataUrl, scene });
    }
  }
}
