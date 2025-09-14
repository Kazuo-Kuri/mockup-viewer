// src/lib/export-bag.ts
// Three.js を使って WebGL の内容を PNG dataURL にするための堅牢版。
// - preserveDrawingBuffer が無い環境でも、直前に強制描画→2Dキャンバスへコピーで極力回収
// - 透明背景を維持（必要に応じて transparent: true）
// - scale 指定で高解像度出力

type ExportOpts = {
  transparent?: boolean; // 既定 true（背景透明）
  scale?: number;        // 既定 1（2 にすると 2x 解像度）
  /** 直前に 1 フレーム強制描画したい場合のフック（例: () => renderer.render(scene,camera)） */
  renderHook?: () => void;
};

function pickCanvas(): HTMLCanvasElement {
  // WebGL の <canvas> を優先的に取得
  const cands = Array.from(document.querySelectorAll("canvas")) as HTMLCanvasElement[];
  if (cands.length === 0) throw new Error("canvas 要素が見つかりません。");
  // webgl2 / webgl コンテキストを持つものを優先
  for (const c of cands) {
    if (c.getContext("webgl2") || c.getContext("webgl")) return c;
  }
  return cands[0];
}

export async function exportCurrentBagPNG(opts: ExportOpts = {}): Promise<string> {
  const { transparent = true, scale = 1, renderHook } = opts;

  const src = pickCanvas();

  // 直前に 1 フレーム描画（WebGL の既定でバッファが消えるケースを避ける）
  try { renderHook?.(); } catch {}

  // WebGL の内容を 2D キャンバスにコピーしてから dataURL 化（preserveDrawingBuffer 依存を減らす）
  const sw = Math.max(2, Math.floor(src.width * scale));
  const sh = Math.max(2, Math.floor(src.height * scale));

  const dst = document.createElement("canvas");
  dst.width = sw;
  dst.height = sh;

  const ctx = dst.getContext("2d");
  if (!ctx) throw new Error("2D コンテキストが取得できません。");

  if (transparent) {
    ctx.clearRect(0, 0, sw, sh);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sw, sh);
  }

  // CSS サイズではなく実ピクセルで drawImage
  ctx.drawImage(src, 0, 0, sw, sh);

  const dataUrl = dst.toDataURL("image/png");

  // 簡易チェック：あまりに短い dataURL は失敗の可能性
  if (!dataUrl.startsWith("data:image/png") || dataUrl.length < 5000) {
    console.warn("[exportCurrentBagPNG] suspicious dataURL length:", dataUrl.length);
  }

  return dataUrl;
}
