// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene, SCENE_API_BASE } from "../lib/api";

const btn = document.getElementById("btn-cafe") as HTMLButtonElement | null;
const out = document.getElementById("scene-out") as HTMLDivElement | null;

if (!btn || !out) {
  console.error("#btn-cafe / #scene-out が見つかりません。index.html のIDを確認してください。");
}

/** out に画像を描画 */
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

/** プレビュー用に別タブで開く */
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

/** 初期化（環境変数が無ければボタン無効化） */
(function setupCafeButton() {
  console.log("[scene] SCENE_API_BASE =", SCENE_API_BASE);
  if (!btn) return;
  if (!SCENE_API_BASE) {
    btn.disabled = true;
    if (out) {
      out.innerHTML = `
        <div style="color:#b45309;background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:6px">
          カフェ合成APIが未設定のため、この機能は現在オフになっています。管理者は Render の Environment に <code>VITE_SCENE_API</code> を設定してください。
        </div>`;
    }
  } else {
    btn.disabled = false;
  }
})();

/** クリックでバッグPNGを書き出して合成 → 表示 */
btn?.addEventListener("click", async () => {
  if (!out || !btn || !SCENE_API_BASE) return;

  btn.disabled = true;
  out.textContent = "生成中…";

  try {
    // ① Three.js 側から現状のバッグを透過PNGの dataURL で取得
    //    exportCurrentBagPNG() が dataURL を返す前提。透過になっていないと背景が隠れます。
    const bagDataUrl = await exportCurrentBagPNG(); // 例: "data:image/png;base64,...."
    if (!bagDataUrl || typeof bagDataUrl !== "string" || !bagDataUrl.startsWith("data:image/png")) {
      throw new Error("バッグPNGの生成に失敗（dataURL が不正）");
    }

    // ② API合成：まずは JSON(dataURL) 返却を優先
    let urlForView: string | null = null;

    try {
      const resultJson = await composeScene(bagDataUrl, true); // { image_data_url }
      // @ts-expect-error 型分岐のため
      if (resultJson?.image_data_url) {
        urlForView = resultJson.image_data_url as string;
      }
    } catch (e) {
      console.warn("[scene] JSON返却に失敗。画像バイナリ返却にフォールバックします。", e);
    }

    // ③ JSON 失敗時は画像バイナリ返却パスで再試行
    if (!urlForView) {
      const resultBlob = await composeScene(bagDataUrl, false); // { imageBlob }
      // @ts-expect-error 型分岐のため
      const blob: Blob | undefined = resultBlob?.imageBlob;
      if (!blob) throw new Error("composeScene は成功しましたが imageBlob がありません。");
      urlForView = URL.createObjectURL(blob);
    }

    // ④ 表示（別タブ & ページ内）
    openPreviewTab(urlForView);
    renderToOut(urlForView);
  } catch (e: any) {
    console.error(e);
    out.innerHTML = `<div style="color:#c00;">${e?.message || "生成に失敗しました"}</div>`;
  } finally {
    btn.disabled = false;
  }
});
