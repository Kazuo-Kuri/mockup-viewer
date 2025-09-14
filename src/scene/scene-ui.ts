// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene } from "../lib/api";

type ComposeResult =
  | string // dataURL もしくは http(s) URL
  | { imageBlob: Blob }
  | { url: string };

const btn = document.getElementById("btn-cafe") as HTMLButtonElement | null;
const out = document.getElementById("scene-out") as HTMLDivElement | null;

if (!btn || !out) {
  console.error(
    "#btn-cafe / #scene-out が見つかりません。index.html のIDを確認してください。"
  );
}

/** API ベースURL（未設定なら undefined） */
const API_BASE = (import.meta as any)?.env?.VITE_SCENE_API as
  | string
  | undefined;

/** dataURL/URL/Blob を #scene-out に描画して、load/error をログ */
function renderToOut(source: string | Blob) {
  if (!out) return;
  const img = new Image();
  img.onload = () =>
    console.log("[scene] img loaded:", img.naturalWidth, img.naturalHeight);
  img.onerror = (e) => console.error("[scene] img error:", e);
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  img.decoding = "async";

  if (source instanceof Blob) {
    img.src = URL.createObjectURL(source);
  } else {
    img.src = source;
  }

  out.innerHTML = "";
  out.appendChild(img);
}

/** 新規タブで確実に表示（window.open(url) だと空白になるケースの対策） */
function openPreviewTab(url: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`
    <html><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh">
      <img src="${url}" style="max-width:100vw;max-height:100vh;display:block"/>
    </body></html>
  `);
  w.document.close();
}

/** composeScene の戻り値を統一的に URL or Blob に変換 */
function normalizeComposeResult(res: ComposeResult): { url?: string; blob?: Blob } {
  if (typeof res === "string") {
    return { url: res };
  }
  if ("imageBlob" in res && res.imageBlob instanceof Blob) {
    return { blob: res.imageBlob };
  }
  if ("url" in res && typeof res.url === "string") {
    return { url: res.url };
  }
  return {};
}

/** API 未設定ならボタンを無効化（UXメッセージ付き） */
(function guardApiEnv() {
  if (!btn || !out) return;
  if (!API_BASE || String(API_BASE).trim() === "") {
    btn.disabled = true;
    btn.title =
      "管理者設定が未完了のため一時的に無効化されています（VITE_SCENE_API が未設定）。";
    const note = document.createElement("div");
    note.style.cssText = "color:#b45309;background:#FFF7ED;border:1px solid #FDE68A;padding:.5rem .75rem;border-radius:.5rem;margin:.5rem 0;";
    note.textContent =
      "カフェ合成APIが未設定のため、この機能は現在オフになっています。管理者は Render の Environment に VITE_SCENE_API を設定してください。";
    out.parentElement?.insertBefore(note, out);
  }
})();

btn?.addEventListener("click", async () => {
  if (!out || !btn) return;

  btn.disabled = true;
  out.textContent = "生成中…";

  try {
    console.log("[scene] exporting bag png...");
    const bag = await exportCurrentBagPNG(); // data:image/png;base64,...
    console.log("[scene] bag length:", bag?.length);

    const result = (await composeScene(bag)) as ComposeResult;

    const norm = normalizeComposeResult(result);
    if (!norm.url && !norm.blob) {
      throw new Error("生成結果の形式を認識できませんでした。");
    }

    // 新規タブで直接確認（URLが得られた場合のみ）
    if (norm.url) {
      console.log("[scene] received url head:", norm.url.slice(0, 60));
      console.log("[scene] is dataURL?     :", norm.url.startsWith("data:image"));
      openPreviewTab(norm.url);
      renderToOut(norm.url);
    } else if (norm.blob) {
      console.log("[scene] received blob:", norm.blob.type, norm.blob.size);
      renderToOut(norm.blob);
      // 参照用に ObjectURL を開く（任意）
      const url = URL.createObjectURL(norm.blob);
      openPreviewTab(url);
    }
  } catch (e: any) {
    console.error("[scene] compose failed:", e);
    out.innerHTML = `<div style="color:#c00;">${
      e?.message || "生成に失敗しました"
    }</div>`;
  } finally {
    btn.disabled = false;
  }
});
