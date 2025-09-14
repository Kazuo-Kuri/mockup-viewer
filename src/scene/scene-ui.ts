// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene, SCENE_API_BASE } from "../lib/api";

/** デバッグ用フラグ: サーバを使わずクライアントだけで合成（.env で VITE_SCENE_DEBUG_CLIENT=1） */
const DEBUG_CLIENT = import.meta.env.VITE_SCENE_DEBUG_CLIENT === "1";
/** デバッグ用の背景パス（プロジェクト内の実ファイルに合わせて必要なら変更） */
const CAFE_BG = "/assets/cafe-1.jpg";

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
  console.log("[scene] SCENE_API_BASE =", SCENE_API_BASE, "DEBUG_CLIENT =", DEBUG_CLIENT);
  if (!btn) return;
  if (!SCENE_API_BASE && !DEBUG_CLIENT) {
    btn.disabled = true;
    if (out) {
      out.innerHTML = `
        <div style="color:#b45309;background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:6px">
          カフェ合成APIが未設定のため、この機能は現在オフになっています。Render の Environment に <code>VITE_SCENE_API</code> を設定してください。
          <div style="margin-top:6px;opacity:.75">（ローカル検証なら <code>VITE_SCENE_DEBUG_CLIENT=1</code> を設定するとクライアント合成モードで動作します）</div>
        </div>`;
    }
  } else {
    btn.disabled = false;
  }
})();

/** ミニプレビュー（袋PNGが作れているか即確認用） */
function showMiniBagPreview(dataUrl: string) {
  const box = document.createElement("div");
  box.style.cssText = "margin:8px 0; font:12px/1.4 system-ui;";
  box.innerHTML = `
    <div style="opacity:.7">bag preview (client-side): length=${dataUrl.length}</div>
    <img src="${dataUrl}" style="max-width:160px; background:#eee; border:1px solid #ddd; border-radius:6px; display:block"/>
  `;
  out?.prepend(box);
}

/** クライアント合成（デバッグ用。サーバ未使用） */
async function composeOnClient(bgUrl: string, bagDataUrl: string): Promise<string> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => ok(i);
      i.onerror = ng;
      i.src = src;
    });

  const [bgImg, bagImg] = await Promise.all([load(bgUrl), load(bagDataUrl)]);

  const canvas = document.createElement("canvas");
  canvas.width = bgImg.naturalWidth;
  canvas.height = bgImg.naturalHeight;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImg, 0, 0);

  // ざっくり中央に 25% 幅で重ねる（必要に応じて調整）
  const targetW = Math.floor(canvas.width * 0.25);
  const targetH = Math.floor(bagImg.naturalHeight * (targetW / bagImg.naturalWidth));
  const x = Math.floor((canvas.width - targetW) / 2);
  const y = Math.floor((canvas.height - targetH) / 2);

  ctx.drawImage(bagImg, x, y, targetW, targetH);

  return canvas.toDataURL("image/png");
}

btn?.addEventListener("click", async () => {
  if (!out || !btn) return;
  if (!SCENE_API_BASE && !DEBUG_CLIENT) return; // どちらも無いなら実行不可

  btn.disabled = true;
  out.textContent = "生成中…";

  try {
    // ① Three.js から透過PNGの dataURL を取得（transparent 推奨）
    const bagDataUrl = await exportCurrentBagPNG({ transparent: true, scale: 1 });
    if (!bagDataUrl || typeof bagDataUrl !== "string" || !bagDataUrl.startsWith("data:image/png")) {
      throw new Error("バッグPNGの生成に失敗（PNG dataURLが得られていません）");
    }
    console.log("[bag] dataURL length =", bagDataUrl.length);
    showMiniBagPreview(bagDataUrl);

    // ② デバッグ: クライアント合成モードならここで完結
    if (DEBUG_CLIENT) {
      const localUrl = await composeOnClient(CAFE_BG, bagDataUrl);
      openPreviewTab(localUrl);
      renderToOut(localUrl);
      return;
    }

    // ③ サーバ合成（JSON優先→失敗したらmultipartに自動フォールバック：api.tsのcomposeSceneに準拠）
    const result: any = await composeScene({ pngDataUrl: bagDataUrl, scene: "cafe-1", preferJson: true });

    // ④ 返却の型に応じてURLを作る
    let urlForView: string | null = null;
    if (result && typeof result.image_data_url === "string") {
      urlForView = result.image_data_url;
    } else if (result && result.imageBlob instanceof Blob) {
      urlForView = URL.createObjectURL(result.imageBlob);
    }
    if (!urlForView) throw new Error("合成結果に画像が含まれていません。");

    // ⑤ 表示
    openPreviewTab(urlForView);
    renderToOut(urlForView);
  } catch (e: any) {
    console.error(e);
    out.innerHTML = `<div style="color:#c00;">${e?.message || "生成に失敗しました"}</div>`;
  } finally {
    btn.disabled = false;
  }
});
