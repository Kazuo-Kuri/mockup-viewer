// src/scene/scene-ui.ts
// 左カラムからの "bag:rendered"（袋PNGの dataURL を含む）を受け取り、
// 右カラム（上＝カフェ、下＝棚）に、X/Y/H で配置して合成表示します。

type BagPlacement = { x: number; y: number; h: number }; // 背景座標系（左上基準, px）
type Profile = {
  name: "cafe" | "shelf";
  bgUrl: string;           // 背景画像
  outEl: HTMLElement;      // 出力先
  canvasW?: number;        // 出力横幅（省略時は背景原寸）
  bag: BagPlacement;       // ← ここだけ変えれば位置とサイズを即調整可能！
};

// 便利関数
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
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 合成処理：背景に袋PNGを X/Y/H で配置
 */
async function composeWithBag(profile: Profile, bagDataUrl: string) {
  const { bgUrl, outEl } = profile;
  const [bgImg, bagImg] = await Promise.all([loadImage(bgUrl), loadImage(bagDataUrl)]);

  // 出力キャンバスのサイズ決定（背景原寸 or 指定横幅）
  const baseW = profile.canvasW ?? bgImg.naturalWidth;
  const scale = baseW / bgImg.naturalWidth;
  const baseH = Math.round(bgImg.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = baseW;
  canvas.height = baseH;

  // 背景を描画
  ctx.drawImage(bgImg, 0, 0, baseW, baseH);

  // 袋の配置（背景座標→キャンバス座標へスケール）
  const sx = (v: number) => Math.round(v * scale);
  const { x, y, h } = profile.bag;
  const drawH = sx(h);
  const ratio = bagImg.naturalWidth / bagImg.naturalHeight;
  const drawW = Math.round(drawH * ratio);
  const drawX = sx(x);
  const drawY = sx(y);

  // 袋PNG（透過）を配置
  ctx.drawImage(bagImg, drawX, drawY, drawW, drawH);

  // DOMへ反映
  const out = new Image();
  out.alt = profile.name;
  out.src = canvas.toDataURL("image/png");
  out.style.maxWidth = "100%";
  out.style.height = "auto";
  outEl.innerHTML = "";
  outEl.appendChild(out);
}

// ====== 各ビューの配置パラメータ（ここを編集するだけで調整OK） ======
const PROFILES: Record<"cafe" | "shelf", Profile> = {
  cafe: {
    name: "cafe",
    bgUrl: "/scenes/cafe.jpg",           // public/scenes/cafe.jpg
    outEl: $("#scene-out"),              // 右上
    canvasW: 1600,                       // 出力横幅（重い時は下げる）
    bag: { x: 980, y: 360, h: 780 },     // ★ 袋の左上X/Yと高さH（px, 背景生ピクセル基準）
  },
  shelf: {
    name: "shelf",
    bgUrl: "/scenes/shelf.jpg",          // public/scenes/shelf.jpg
    outEl: $("#right-bottom"),           // 右下
    canvasW: 1600,
    bag: { x: 820, y: 520, h: 760 },     // ★ ここも自由に
  },
};

// 初期表示
try {
  $("#scene-out").textContent = "袋PNGの生成を待機中…";
  $("#right-bottom").textContent = "袋PNGの生成を待機中…";
} catch { /* noop */ }

// ====== イベント購読：Scene.jsx が固定ビューで書き出した袋PNGを受け取る ======
type BagRenderedDetail = { dataUrl: string; view: "cafe" | "shelf" };

window.addEventListener("bag:rendered", async (ev: Event) => {
  const detail = (ev as CustomEvent).detail as BagRenderedDetail | undefined;
  if (!detail?.dataUrl || !detail.view) return;

  const profile = PROFILES[detail.view];
  if (!profile) return;

  try {
    await composeWithBag(profile, detail.dataUrl);
  } catch (e) {
    console.error("[compose error]", e);
    profile.outEl.textContent = `合成に失敗しました：${String(e)}`;
  }
});
