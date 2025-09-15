// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene, SCENE_API_BASE } from "../lib/api";

/** デバッグ用フラグ: サーバを使わずクライアントだけで合成（.env で VITE_SCENE_DEBUG_CLIENT=1） */
const DEBUG_CLIENT = import.meta.env.VITE_SCENE_DEBUG_CLIENT === "1";
/** デバッグ用の背景パス（プロジェクト内の実ファイルに合わせて必要なら変更） */
const CAFE_BG = "/assets/cafe-1.jpg";
/** 追加: 他背景（デバッグ時に流用。実素材が無ければ同じ画像でOK） */
const SHELF_BG = "/assets/shelf-1.jpg";
const COUNTER_BG = "/assets/counter-1.jpg";
const STUDIO_BG = "/assets/studio-1.jpg";

/* ===================== 既存の単発（カフェ）UI要素 ===================== */
const btn = document.getElementById("btn-cafe") as HTMLButtonElement | null;
const out = document.getElementById("scene-out") as HTMLDivElement | null;

if (!btn || !out) {
  console.warn("#btn-cafe / #scene-out は新UIでは非必須です（見つからなくても続行します）。");
}

/* ===================== 新UI（上部ツールバー & 右2Dプレビュー） ===================== */
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

/** サーバ側のシーンキー（api.ts の仕様に合わせる） */
const BG_SCENES: Record<PreviewKey, string> = {
  cafe: "cafe-1",
  shelf: "shelf-1",
  counter: "counter-1",
  free: "studio-1",
};

/** デバッグ（クライアント合成）時の背景パス */
const BG_DEBUG_SRC: Record<PreviewKey, string> = {
  cafe: CAFE_BG,
  shelf: SHELF_BG || CAFE_BG,
  counter: COUNTER_BG || CAFE_BG,
  free: STUDIO_BG || CAFE_BG,
};

/* ===================== 既存の表示ユーティリティ ===================== */
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

/* ===================== 初期チェック（既存UIの警告/案内） ===================== */
(function setupCafeButton() {
  console.log("[scene] SCENE_API_BASE =", SCENE_API_BASE, "DEBUG_CLIENT =", DEBUG_CLIENT);
  if (!btn) return; // 新UIでは存在しなくてもOK
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

/* ===================== 既存：ミニプレビュー ===================== */
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

/* ===================== クライアント合成（DEBUG用） ===================== */
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

  // デフォルト：中央に25%幅で合成（位置はサーバ側と合うよう後で調整）
  const targetW = Math.floor(canvas.width * 0.25);
  const targetH = Math.floor(bagImg.naturalHeight * (targetW / bagImg.naturalWidth));
  const x = Math.floor((canvas.width - targetW) / 2);
  const y = Math.floor((canvas.height - targetH) / 2);
  ctx.drawImage(bagImg, x, y, targetW, targetH);

  return canvas.toDataURL("image/png");
}

/* ===================== 追加：固定プロファイルでのPNGエクスポート ===================== */
/**
 * 3Dのユーザー操作に依存しない固定アングルで透過PNGを書き出す。
 * - exportCurrentBagPNG が profile: "locked" を受け付ける前提で呼び出し
 * - 未対応ビルドでも余計なプロパティは無視されるため安全
 */
async function exportBagLockedPNG(): Promise<string> {
  // 透明推奨。scale は既存互換で同値を渡す
  const dataUrl = await (exportCurrentBagPNG as any)({ transparent: true, scale: 1, profile: "locked" });
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) {
    throw new Error("バッグPNGの生成に失敗（PNG dataURLが得られていません）");
  }
  return dataUrl;
}

/* ===================== 右側2Dプレビュー4枠の一括更新 ===================== */
let refreshing = false;
let dirty = false;
async function refreshRightPreviews() {
  // 右パネル要素が無ければ何もしない（HTML移行段階の互換）
  const keys = (["cafe", "shelf", "counter", "free"] as PreviewKey[]).filter((k) => !!$img[k]);
  if (keys.length === 0) return;

  if (refreshing) {
    dirty = true;
    return;
  }
  refreshing = true;

  try {
    const bagPNG = await exportBagLockedPNG();

    // サーバ合成 or デバッグ合成を並列で
    const tasks = keys.map(async (k) => {
      if (DEBUG_CLIENT) {
        return composeOnClient(BG_DEBUG_SRC[k], bagPNG);
      }
      const result: any = await composeScene({ pngDataUrl: bagPNG, scene: BG_SCENES[k], preferJson: true });
      if (result && typeof result.image_data_url === "string") return result.image_data_url;
      if (result && result.imageBlob instanceof Blob) return URL.createObjectURL(result.imageBlob);
      throw new Error(`合成結果(${k})に画像が含まれていません。`);
    });

    const urls = await Promise.all(tasks);
    keys.forEach((k, i) => {
      const el = $img[k]!;
      el.src = urls[i];
    });
  } catch (e) {
    console.error("[preview] refreshRightPreviews error:", e);
  } finally {
    refreshing = false;
    if (dirty) {
      dirty = false;
      refreshRightPreviews();
    }
  }
}

/** 右枠更新のデバウンスヘルパ */
let debounceTimer: number | null = null;
function scheduleRefreshRightPreviews(delay = 300) {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    refreshRightPreviews();
    debounceTimer = null;
  }, delay) as unknown as number;
}

/* ===================== 新UIのイベント結線 ===================== */
// PNG書き出し（固定アングル素材をダウンロード）
btnExport?.addEventListener("click", async () => {
  try {
    const dataUrl = await exportBagLockedPNG();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "bag-locked.png";
    a.click();
  } catch (e: any) {
    console.error(e);
    alert(e?.message || "PNG書き出しに失敗しました");
  }
});

// 右の背景プレビュー更新（3〜4枠を一括）
btnRefreshPreviews?.addEventListener("click", () => {
  refreshRightPreviews();
});

// データアップロード（テクスチャ等が差し替わったら右側を更新したい場合はここでスケジュール）
fileInput?.addEventListener("change", () => {
  // （あなたのテクスチャ適用処理が終わった後に）
  scheduleRefreshRightPreviews(400);
});

/* ===================== 既存：「カフェで見る」ボタンの挙動を固定アングル化 ===================== */
btn?.addEventListener("click", async () => {
  if (!SCENE_API_BASE && !DEBUG_CLIENT) return; // どちらも無いなら実行不可

  btn.disabled = true;
  if (out) out.textContent = "生成中…";

  try {
    // ① 固定プロファイルで透過PNGを書き出し（ユーザー操作の影響なし）
    const bagDataUrl = await exportBagLockedPNG();
    console.log("[bag] dataURL length =", bagDataUrl.length);
    if (out) showMiniBagPreview(bagDataUrl);

    // ② デバッグ: クライアント合成モードならここで完結
    if (DEBUG_CLIENT) {
      const localUrl = await composeOnClient(CAFE_BG, bagDataUrl);
      openPreviewTab(localUrl);
      renderToOut(localUrl); // 旧UIの右側にも出す
      // 新UIがあれば右上のカフェ枠も更新
      if ($img.cafe) $img.cafe.src = localUrl;
      return;
    }

    // ③ サーバ合成（JSON優先→失敗したらmultipartに自動フォールバック：api.tsのcomposeSceneに準拠）
    const result: any = await composeScene({ pngDataUrl: bagDataUrl, scene: "cafe-1", preferJson: true });

    // ④ URL決定
    let urlForView: string | null = null;
    if (result && typeof result.image_data_url === "string") {
      urlForView = result.image_data_url;
    } else if (result && result.imageBlob instanceof Blob) {
      urlForView = URL.createObjectURL(result.imageBlob);
    }
    if (!urlForView) throw new Error("合成結果に画像が含まれていません。");

    // ⑤ 表示（旧UI＆新UIの両対応）
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

/* ===================== 起動時の右枠初期化（白のままでOKだが、欲しければ自動更新） ===================== */
// 初期は白でOK → 何もしない
// 自動で初回生成したい場合は、下のコメントアウトを外す
// refreshRightPreviews();
