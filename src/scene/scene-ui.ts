// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene, SCENE_API_BASE } from "../lib/api";

const btn = document.getElementById("btn-cafe") as HTMLButtonElement | null;
const out = document.getElementById("scene-out") as HTMLDivElement | null;

if (!btn || !out) {
  console.error("#btn-cafe / #scene-out が見つかりません。index.html のIDを確認してください。");
}

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
  box.style.cssText = "margin:
