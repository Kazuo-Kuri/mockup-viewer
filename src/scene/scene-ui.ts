// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene, SCENE_API_BASE } from "../lib/api";

/** デバッグ用フラグ: サーバを使わずクライアントだけで合成（.env で VITE_SCENE_DEBUG_CLIENT=1） */
const DEBUG_CLIENT = import.meta.env.VITE_SCENE_DEBUG_CLIENT === "1";
/** デバッグ用の背景パス（プロジェクト内の実ファイルに合わせて必要なら変更） */
const CAFE_BG = "/assets/cafe-1.jpg";
const SHELF_BG = "/assets/shelf-1.jpg";
const COUNTER_BG = "/assets/counter-1.jpg";
const STUDIO_BG = "/assets/studio-1.jpg";

/* ========== 既存の単発UI（カフェで見る） ========== */
const btn = document.getElementById("btn-cafe") as HTMLButtonElement | null;
const out = document.getElementById("scene-out") as HTMLDivElement | null;

if (!btn || !out) {
  console.warn("#btn-cafe / #scene-out は見つからなくてもOK（新UIでは任意）");
}

/** out に画像を描画（旧UI互換） */
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

/** 別タブでプレビュー */
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

/** 初期化（環境変数が無ければ旧UIボタン無効化） */
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

/** ミニプレビュー（旧UI確認用） */
function showMiniBagPreview(dataUrl: string) {
  if (!out) return;
  const box = document.createElement("div");
  box.style.cssText = "margin:8px 0; font:12px/1.4 system-ui;";
  box.innerHTML = `
    <div style="opacity:.7">bag preview (client-side): length=${dataUrl.length}</div>
    <img src="${dataUrl}" style="max-width:160px; background:#eee; border:1px solid #ddd; border-radius:6px; display:block"/>
  `;
  out.prepend(box);
}

/** クライアント合成（DEBUG用） */
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

  // 中央に 25% 幅で重ねる（DEBUG用途・暫定）
  const targetW = Math.floor(canvas.width * 0.25);
  const targetH = Math.floor(bagImg.naturalHeight * (targetW / bagImg.naturalWidth));
  const x = Math.floor((canvas.width - targetW) / 2);
  const y = Math.floor((canvas.height - targetH) / 2);
  ctx.drawImage(bagImg, x, y, targetW, targetH);

  return canvas.toDataURL("image/png");
}

/* ========== 右パネル（2Dプレビュー。初期は白のまま） ========== */
/** 新UIの要素（存在しなくてもスキップ。3Dには一切触れない） */
const btnExport = document.getElementById("btn-export") as HTMLButtonElement | null;
const btnRefreshPreviews = document.getElementById("btn-refresh-previews") as HTMLButtonElement | null;
const fileInput = document.getElementById("file-upload") as HTMLInputElement | null;

type PreviewKey = "cafe" | "shelf" | "counter" | "free";
const $img: Partial<Record<PreviewKey, HTMLImageElement>> = {
  cafe: document.getElementById("prev-cafe") as HTMLImageElement | null,
  shelf: document.getElementById("prev-shelf") as HTMLImageElement | null,
  counter: document.getElementById("prev-counter") as HTMLImageElement | null,
  free: document.getElementById("prev-free") as HTMLImageElement | null,
};

const BG_SCENES: Record<PreviewKey, string> = {
  cafe: "cafe-1",
  shelf: "shelf-1",
  counter: "counter-1",
  free: "studio-1",
};

const BG_DEBUG_SRC: Record<PreviewKey, string> = {
  cafe: CAFE_BG,
  shelf: SHELF_BG || CAFE_BG,
  counter: COUNTER_BG || CAFE_BG,
  free: STUDIO_BG || CAFE_BG,
};

/** 3Dに一切干渉しない固定PNGの取得（現状は従来通り・profile指定なし） */
async function getBagPNG(): Promise<string> {
  // 既存実装に合わせて transparent: true, scale:1
  const dataUrl = await exportCurrentBagPNG({ transparent: true, scale: 1 });
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) {
    throw new Error("バッグPNGの生成に失敗（PNG dataURLが得られていません）");
  }
  return dataUrl;
}

/** 右側プレビューを必要時だけ手動更新（存在する枠のみ） */
async function refreshRightPreviews() {
  const keys = (["cafe", "shelf", "counter", "free"] as PreviewKey[]).filter((k) => !!$img[k]);
  if (keys.length === 0) return;

  try {
    const bagPNG = await getBagPNG();

    const urls = await Promise.all(
      keys.map(async (k) => {
        if (DEBUG_CLIENT) return composeOnClient(BG_DEBUG_SRC[k], bagPNG);
        const result: any = await composeScene({ pngDataUrl: bagPNG, scene: BG_SCENES[k], preferJson: true });
        if (result && typeof result.image_data_url === "string") return result.image_data_url;
        if (result && result.imageBlob instanceof Blob) return URL.createObjectURL(result.imageBlob);
        throw new Error(`合成結果(${k})に画像が含まれていません。`);
      })
    );

    keys.forEach((k, i) => {
      const el = $img[k]!;
      el.src = urls[i];
    });
  } catch (e) {
    console.error("[preview] refreshRightPreviews error:", e);
  }
}

/* ========== イベント：3Dには触れない ========== */
// PNG書き出し（固定PNGをダウンロード）
btnExport?.addEventListener("click", async () => {
  try {
    const dataUrl = await getBagPNG();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "bag.png";
    a.click();
  } catch (e: any) {
    console.error(e);
    alert(e?.message || "PNG書き出しに失敗しました");
  }
});

// 右の背景プレビュー更新（手動）
btnRefreshPreviews?.addEventListener("click", () => {
  refreshRightPreviews();
});

// データアップロード（あなたの適用処理が別にある想定。ここでは右だけ必要時に手動更新）
fileInput?.addEventListener("change", () => {
  /* ここでテクスチャ適用が完了したら、必要に応じて ↓ を呼ぶ
     refreshRightPreviews();
  */
});

/* ========== 既存の「カフェで見る」そのまま ========== */
btn?.addEventListener("click", async () => {
  if (!SCENE_API_BASE && !DEBUG_CLIENT) return; // どちらも無いなら実行不可

  btn.disabled = true;
  if (out) out.textContent = "生成中…";

  try {
    const bagDataUrl = await getBagPNG();
    if (out) showMiniBagPreview(bagDataUrl);

    if (DEBUG_CLIENT) {
      const localUrl = await composeOnClient(CAFE_BG, bagDataUrl);
      openPreviewTab(localUrl);
      renderToOut(localUrl);
      // 右パネルがあれば反映（任意）
      if ($img.cafe) $img.cafe.src = localUrl;
      return;
    }

    const result: any = await composeScene({ pngDataUrl: bagDataUrl, scene: "cafe-1", preferJson: true });

    let urlForView: string | null = null;
    if (result && typeof result.image_data_url === "string") urlForView = result.image_data_url;
    else if (result && result.imageBlob instanceof Blob) urlForView = URL.createObjectURL(result.imageBlob);
    if (!urlForView) throw new Error("合成結果に画像が含まれていません。");

    openPreviewTab(urlForView);
    renderToOut(urlForView);
    if ($img.cafe) $img.cafe.src = urlForView;
  } catch (e: any) {
    console.error(e);
    if (out) out.innerHTML = `<div style="color:#c00;">${e?.message || "生成に失敗しました"}</div>`;
  } finally {
    btn.disabled = false;
  }
});
