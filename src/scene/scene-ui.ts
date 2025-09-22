// src/scene/scene-ui.ts
// 役割：Scene.jsx からの "bag:art-loaded" を受け取ったら、右カラムの
// 上段（カフェ）・下段（棚）へ 2D合成結果を自動表示する。

type PrintRect = { x: number; y: number; w: number; h: number };
type BagPlacement = { x: number; y: number; h: number }; // 袋の描画原点は左上、h=高さ(px)
type Profile = {
  name: string;
  bgUrl: string;               // 背景（必須）
  bag?: BagPlacement;          // 袋の置き場所（未指定なら printRect の外枠で代用）
  printRect: PrintRect;        // アートを貼る矩形（背景座標系）
  bagOverlayUrl?: string;      // 透明PNGの袋オーバーレイ（任意）
  outEl: HTMLElement;          // 出力先のDOM
  canvasW?: number;            // 出力キャンバス幅（省略時は背景幅）
};

// ====== ユーティリティ ======
function $(sel: string) {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) throw new Error(`element not found: ${sel}`);
  return el;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

async function compose(profile: Profile, artUrl: string) {
  const { bgUrl, bagOverlayUrl, outEl } = profile;

  // 背景・（任意）袋オーバーレイ・アートをロード
  const [bgImg, overlayImg, artImg] = await Promise.all([
    loadImage(bgUrl),
    bagOverlayUrl ? loadImage(bagOverlayUrl).catch(() => null) : Promise.resolve(null),
    loadImage(artUrl),
  ]);

  // キャンバスサイズは背景基準（必要なら固定幅にスケール）
  const baseW = profile.canvasW ?? bgImg.naturalWidth;
  const scale = baseW / bgImg.naturalWidth;
  const baseH = Math.round(bgImg.naturalHeight * scale);

  // Canvas を用意
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = baseW;
  canvas.height = baseH;

  // 背景
  ctx.drawImage(bgImg, 0, 0, baseW, baseH);

  // 座標変換（設定値は「背景の生ピクセル基準」。canvasW でスケール）
  const sx = (v: number) => Math.round(v * scale);

  // 印刷面の矩形
  const pr = profile.printRect;
  const px = sx(pr.x), py = sx(pr.y), pw = sx(pr.w), ph = sx(pr.h);

  // アートをプリント面にフィット
  // （長辺合わせの cover と迷うが、一般的には短辺合わせの contain が無難）
  const aspectArt = artImg.naturalWidth / artImg.naturalHeight;
  const aspectRect = pw / ph;
  let dw = pw, dh = ph, dx = px, dy = py;
  if (aspectArt > aspectRect) {
    // アートが横長 → 高さ合わせ
    dh = ph;
    dw = Math.round(ph * aspectArt);
    dx = px + Math.round((pw - dw) / 2);
  } else {
    // アートが縦長 or 同等 → 幅合わせ
    dw = pw;
    dh = Math.round(pw / aspectArt);
    dy = py + Math.round((ph - dh) / 2);
  }
  ctx.drawImage(artImg, dx, dy, dw, dh);

  // 袋オーバーレイ（あれば上にのせる：影・ハイライト用）
  if (overlayImg) {
    // 既定では「袋の枠＝printRect を少し大きく囲う」か、bag.x/y/h を使う
    const bp = profile.bag;
    if (bp) {
      const bx = sx(bp.x), by = sx(bp.y), bh = sx(bp.h);
      const ratio = overlayImg.naturalWidth / overlayImg.naturalHeight;
      const bw = Math.round(bh * ratio);
      ctx.drawImage(overlayImg, bx, by, bw, bh);
    } else {
      // bag未指定なら printRect の外枠に合わせて描画（見た目の暫定）
      const pad = sx( pr.w * 0.12 ); // 適度に広げる
      const bh = ph + pad * 2;
      const ratio = overlayImg.naturalWidth / overlayImg.naturalHeight;
      const bw = Math.round(bh * ratio);
      const bx = px + Math.round((pw - bw) / 2);
      const by = py - pad;
      ctx.drawImage(overlayImg, bx, by, bw, bh);
    }
  } else {
    // オーバーレイが無い場合、軽い立体感を足す（簡易）
    const grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, "rgba(0,0,0,0.06)");
    grad.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, ph);
    ctx.globalCompositeOperation = "source-over";
  }

  // DOMへ反映
  const img = new Image();
  img.alt = profile.name;
  img.src = canvas.toDataURL("image/png");
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  outEl.innerHTML = "";
  outEl.appendChild(img);
}

// ====== プロファイル（数値だけ触れば位置調整OK） ======
// すべて「背景画像の生ピクセル」基準で指定します。
// 実出力は canvasW にスケールされます（未指定なら背景原寸のまま）。
function makeProfiles(artUrl: string): Profile[] {
  const outTop = $("#scene-out");       // 上段
  const outBottom = $("#right-bottom"); // 下段

  // 例：カフェ用（BG: public/scenes/cafe.jpg）
  const cafe: Profile = {
    name: "cafe",
    bgUrl: "/scenes/cafe.jpg",
    outEl: outTop,
    canvasW: 1600, // 表示の基準幅（任意）—大きすぎる場合は下げてOK
    // 袋の置き場所（オーバーレイがある場合のみ使用）
    // 例: 背景の(920, 380) に高さ 820px で袋PNGを描く
    bag: { x: 920, y: 380, h: 820 },
    // アートを貼る矩形
    printRect: { x: 980, y: 500, w: 500, h: 640 },
    // 透明袋オーバーレイ（任意）— 置けば質感UP（未用意なら消してください）
    // bagOverlayUrl: "/scenes/bag_overlay_cafe.png",
  };

  // 例：棚用（BG: public/scenes/shelf.jpg）
  const shelf: Profile = {
    name: "shelf",
    bgUrl: "/scenes/shelf.jpg",
    outEl: outBottom,
    canvasW: 1600,
    bag: { x: 760, y: 420, h: 780 },
    printRect: { x: 820, y: 520, w: 460, h: 590 },
    // bagOverlayUrl: "/scenes/bag_overlay_shelf.png",
  };

  return [cafe, shelf];
}

// ====== イベント接続（アップロード完了で自動生成） ======
(function main() {
  // 既存ボタンは未使用（押さなくても自動生成する）
  // 右カラムの初期表示を軽くセット
  try {
    $("#scene-out").textContent = "アート画像の読み込みを待機中…";
    $("#right-bottom").textContent = "アート画像の読み込みを待機中…";
  } catch (e) {
    console.warn(e);
  }

  window.addEventListener("bag:art-loaded", async (ev: Event) => {
    const url = (ev as CustomEvent).detail?.url as string | undefined;
    if (!url) return;

    const profiles = makeProfiles(url);
    for (const pf of profiles) {
      try {
        // 「カフェ」「棚」を並行で描いてもOKだが、ここでは順番に実行
        await compose(pf, url);
      } catch (err) {
        console.error(`[compose:${pf.name}]`, err);
        pf.outEl.textContent = `合成に失敗しました：${String(err)}`;
      }
    }
  });
})();
