// src/lib/export-bag.ts
// Three.js の描画内容を “中身のある透過PNG” として dataURL で返す堅牢版。
// - registerThreeRefs() で renderer/scene/camera を登録すると最も確実
// - 未登録でも WebGL キャンバスを自動検出してコピー
// - 直前 1 フレームの強制描画 renderHook にも対応
// - scale 指定で高解像度出力

export type ExportOpts = {
  transparent?: boolean; // 既定 true（背景透明）
  scale?: number;        // 既定 1（2にすると 2x 解像度）
  /** 三者を登録してない場合に明示描画したいときのフック */
  renderHook?: () => void;
};

let _renderer: any | null = null;
let _scene: any | null = null;
let _camera: any | null = null;

/** Three.js の参照を登録（初期化時に1回呼んでください） */
export function registerThreeRefs(renderer: any, scene: any, camera: any) {
  _renderer = renderer;
  _scene = scene;
  _camera = camera;

  // ★超重要：toDataURL の直前にバッファが消えないように
  try {
    if (_renderer && _renderer.getContext) {
      const gl = _renderer.getContext();
      if (gl && _renderer.preserveDrawingBuffer !== true && _renderer.domElement) {
        // 一部の実装ではコンストラクタのオプションが優先されるが、念のためログ
        console.warn("[export-bag] renderer.preserveDrawingBuffer is not true. Prefer enabling at creation.");
      }
    }
    // ついでに見つけやすいように id を付与
    if (_renderer?.domElement && !_renderer.domElement.id) {
      _renderer.domElement.id = "three-canvas";
    }
  } catch {}
}

function pickCanvas(): HTMLCanvasElement {
  // まず id 付きの three-canvas を探す
  const byId = document.getElementById("three-canvas") as HTMLCanvasElement | null;
  if (byId) return byId;

  // 次に WebGL を持つキャンバスを探す
  const cands = Array.from(document.querySelectorAll("canvas")) as HTMLCanvasElement[];
  for (const c of cands) {
    try {
      if (c.getContext("webgl2") || c.getContext("webgl")) return c;
    } catch {}
  }
  if (cands[0]) return cands[0];
  throw new Error("canvas 要素が見つかりません。");
}

/** 透過PNGの dataURL を返す（失敗しづらい手順で回収） */
export async function exportCurrentBagPNG(opts: ExportOpts = {}): Promise<string> {
  const { transparent = true, scale = 1, renderHook } = opts;

  // 可能なら直前 1 フレームだけ明示描画（バッファ空を回避）
  try {
    if (_renderer && _scene && _camera && typeof _renderer.render === "function") {
      _renderer.render(_scene, _camera);
    } else {
      renderHook?.();
    }
  } catch {}

  // WebGL の内容を 2D キャンバスにコピーしてから dataURL 化（preserveDrawingBuffer 依存を減らす）
  const src = _renderer?.domElement ?? pickCanvas();
  const sw = Math.max(2, Math.floor(src.width * scale));
  const sh = Math.max(2, Math.floor(src.height * scale));

  // ※ src.width/height が 0 の場合は CSS だけで伸ばしているので失敗します
  if (sw <= 2 || sh <= 2) {
    console.warn("[export-bag] source canvas size is very small:", src.width, src.height);
  }

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

  // WebGL→2Dへコピー
  ctx.drawImage(src, 0, 0, sw, sh);

  const dataUrl = dst.toDataURL("image/png");
  if (!dataUrl.startsWith("data:image/png") || dataUrl.length < 12000) {
    // 数千文字だと “中身ほぼ無し” の可能性が高い
    console.warn("[export-bag] suspicious dataURL length:", dataUrl.length);
  }
  return dataUrl;
}
