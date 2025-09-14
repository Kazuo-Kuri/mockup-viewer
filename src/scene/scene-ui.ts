// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene, SCENE_API_BASE } from "../lib/api";

const btn = document.getElementById("btn-cafe") as HTMLButtonElement | null;
const out = document.getElementById("scene-out") as HTMLDivElement | null;

if (!btn || !out) {
  console.error("#btn-cafe / #scene-out が見つかりません。index.html のIDを確認してください。");
}

/** dataURL を #scene-out に描画 */
function renderToOut(url: string) {
  if (!out) return;
  const img = new Image();
  img.onload = () => console.log("[scene] img loaded:", img.naturalWidth, img.naturalHeight);
  img.onerror = (e) => console.error("[scene] img error:", e);
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  img.src = url;
  out.innerHTML = "";
  out.appendChild(img);
}

/** 新規タブでプレビュー */
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

/** 環境変数の有無でボタンを制御 */
(function setupCafeButton() {
  console.log("[scene] SCENE_API_BASE =", SCENE_API_BASE);
  if (!btn) return;

  if (!SCENE_API_BASE) {
    btn.disabled = true;
    btn.title = "Scene API 未設定";
    if (out) {
      out.innerHTML = `
        <div style="color:#b45309;background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:6px">
          カフェ合成APIが未設定のため、この機能は現在オフになっています。管理者は Render の Environment に <code>VITE_SCENE_API</code> を設定してください。
        </div>`;
    }
  } else {
    btn.disabled = false;
    btn.title = "";
  }
})();

btn?.addEventListener("click", async () => {
  if (!out || !btn) return;
  if (!SCENE_API_BASE) return;

  btn.disabled = true;
  out.textContent = "生成中…";

  try {
    console.log("[scene] exporting bag png...");
    const bag = await exportCurrentBagPNG(); // data:image/png;base64,...
    console.log("[scene] bag length:", bag?.length);

    const result = await composeScene(bag, /*asJson*/ true);
    const url: string = result?.image_data_url; // APIは dataURL を返す

    console.log("[scene] received url head:", url?.slice(0, 40));
    openPreviewTab(url);
    renderToOut(url);
  } catch (e: any) {
    console.error(e);
    out.innerHTML = `<div style="color:#c00;">${e?.message || "生成に失敗しました"}</div>`;
  } finally {
    btn.disabled = false;
  }
});
