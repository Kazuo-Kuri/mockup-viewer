// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from "../lib/export-bag";
import { composeScene } from "../lib/api";

const btn = document.getElementById("btn-cafe") as HTMLButtonElement | null;
const out = document.getElementById("scene-out") as HTMLDivElement | null;

if (!btn || !out) {
  console.error(
    "#btn-cafe / #scene-out が見つかりません。index.html のIDを確認してください。"
  );
}

/** dataURL を #scene-out に描画して、load/error をログ */
function renderToOut(url: string) {
  if (!out) return;
  const img = new Image();
  img.onload = () =>
    console.log("[scene] img loaded:", img.naturalWidth, img.naturalHeight);
  img.onerror = (e) => console.error("[scene] img error:", e);
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  img.src = url;
  out.innerHTML = "";
  out.appendChild(img);
}

/** 新規タブで確実に表示（window.open(url) だと空白になるケースの対策） */
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

btn?.addEventListener("click", async () => {
  if (!out || !btn) return;

  btn.disabled = true;
  out.textContent = "生成中…";

  try {
    console.log("[scene] exporting bag png...");
    const bag = await exportCurrentBagPNG(); // data:image/png;base64,...
    console.log("[scene] bag length:", bag?.length);

    const url = await composeScene(bag); // サーバから dataURL
    console.log("[scene] received url head:", url?.slice(0, 40));
    console.log("[scene] received url len :", url?.length);
    console.log("[scene] is dataURL?     :", url?.startsWith("data:image"));

    // 新規タブで直接確認（配線の切り分け用）
    openPreviewTab(url);

    // ページ内にも描画
    renderToOut(url);
  } catch (e: any) {
    console.error(e);
    out.innerHTML = `<div style="color:#c00;">${
      e?.message || "生成に失敗しました"
    }</div>`;
  } finally {
    btn.disabled = false;
  }
});
