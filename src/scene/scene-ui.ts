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
          カフェ合成APIが未設定のため、この機能は現在オフになっています。Render の Environment に <code>VITE_SCENE_API</code> を設定してください。
        </div>`;
    }
  } else {
    btn.disabled = false;
  }
})();

/** ミニプレビュー（袋PNGが作れているか即確認用） */
function showMiniBagPreview(dataUrl: string) {
  const box = document.createElement("div");
  box.style.cssText = "margin:8px 0; font:12px/1.4 system-ui;"; // ★ここが原因。1行の文字列に修正
  box.innerHTML = `
    <div style="opacity:.7">bag preview (client-side): length=${dataUrl.length}</div>
    <img src="${dataUrl}" style="max-width:160px; background:#eee; border:1px solid #ddd; border-radius:6px; display:block"/>
  `;
  out?.prepend(box);
}

btn?.addEventListener("click", async () => {
  if (!out || !btn || !SCENE_API_BASE) return;

  btn.disabled = true;
  out.textContent = "生成中…";

  try {
    // ① Three.js から透過PNGの dataURL を取得
    const bagDataUrl = await exportCurrentBagPNG(); // 例: "data:image/png;base64,..."
    if (!bagDataUrl || typeof bagDataUrl !== "string" || !bagDataUrl.startsWith("data:image/png")) {
      throw new Error("バッグPNGの生成に失敗（PNG dataURLが得られていません）");
    }
    console.log("[bag] dataURL length =", bagDataUrl.length);
    showMiniBagPreview(bagDataUrl);

    // ② API合成（JSON返却優先。失敗すればフォーム送信にフォールバックする composeScene を利用）
    // ※ あなたの api.ts を私の提案版に更新済みである前提（composeScene({ pngDataUrl, scene, preferJson })）
    const result: any = await composeScene({ pngDataUrl: bagDataUrl, scene: "cafe-1", preferJson: true });

    // ③ 返却の型に応じてURLを作る
    let urlForView: string | null = null;
    if (result && typeof result.image_data_url === "string") {
      urlForView = result.image_data_url;
    } else if (result && result.imageBlob instanceof Blob) {
      urlForView = URL.createObjectURL(result.imageBlob);
    }
    if (!urlForView) throw new Error("合成結果に画像が含まれていません。");

    // ④ 表示
    openPreviewTab(urlForView);
    renderToOut(urlForView);
  } catch (e: any) {
    console.error(e);
    out.innerHTML = `<div style="color:#c00;">${e?.message || "生成に失敗しました"}</div>`;
  } finally {
    btn.disabled = false;
  }
});
