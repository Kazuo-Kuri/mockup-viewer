// src/lib/api.ts

// Render などの環境変数は VITE_ プレフィックスで参照
const RAW_API: string | undefined = import.meta.env.VITE_SCENE_API;
/** 末尾スラッシュ除去済みの API ベースURL */
export const SCENE_API_BASE = (RAW_API || "").trim().replace(/\/+$/, "");

console.log("[env] VITE_SCENE_API(raw) =", RAW_API);
console.log("[env] SCENE_API_BASE     =", SCENE_API_BASE);

export type ComposeJsonResponse = { image_data_url: string };
export type ComposeBlobResponse = { imageBlob: Blob };
export type ComposeResult = ComposeJsonResponse | ComposeBlobResponse;

export type ComposeParams = {
  /** data:image/png;base64,... （透過推奨） */
  pngDataUrl: string;
  /** サーバ側がシーン切替を受ける場合に備える */
  scene?: string; // 例: "cafe-1"
  /** JSON優先（既定true）。失敗時はフォームデータに自動フォールバック */
  preferJson?: boolean;
};

async function postJson({
  pngDataUrl,
  scene,
}: {
  pngDataUrl: string;
  scene?: string;
}): Promise<ComposeJsonResponse> {
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

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  // fetch を使うと dataURL→Blob 変換が簡単
  return await (await fetch(dataUrl)).blob();
}

async function postForm({
  pngDataUrl,
  scene,
}: {
  pngDataUrl: string;
  scene?: string;
}): Promise<ComposeResult> {
  const url = `${SCENE_API_BASE}/compose`;
  const form = new FormData();

  const blob = await dataUrlToBlob(pngDataUrl);

  // ▼ サーバの取り回し差（フィールド名の揺れ）に“全部のせ”で対応
  form.append("bag", blob, "bag.png");
  form.append("file", blob, "bag.png");
  form.append("image", blob, "bag.png");
  form.append("overlay", blob, "bag.png");

  // dataURL文字列で受ける実装向けにも添付
  form.append("image_data_url", pngDataUrl);
  form.append("png", pngDataUrl);

  if (scene) form.append("scene", scene);

  const res = await fetch(url, { method: "POST", body: form });
  const ct = res.headers.get("content-type") || "";

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Scene API(FORM) ${res.status} ${res.statusText} ${t.slice(0, 200)}`);
  }

  // 画像をそのまま返す実装
  if (ct.startsWith("image/")) {
    const b = await res.blob();
    return { imageBlob: b };
  }

  // JSON(dataURL) を返す実装
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
export async function composeScene({
  pngDataUrl,
  scene,
  preferJson = true,
}: ComposeParams): Promise<ComposeResult> {
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
