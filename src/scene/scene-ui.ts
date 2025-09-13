// src/scene/scene-ui.ts
import { exportCurrentBagPNG } from '../lib/export-bag';
import { composeScene } from '../lib/api';

const btn = document.getElementById('btn-cafe') as HTMLButtonElement | null;
const out = document.getElementById('scene-out') as HTMLDivElement | null;

if (!btn || !out) {
  console.error('#btn-cafe / #scene-out が見つかりません。index.html のIDを確認してください。');
}

btn?.addEventListener('click', async () => {
  if (!out) return;

  btn.disabled = true;
  out.textContent = '生成中…';

  try {
    console.log('[scene] exporting bag png...');
    const bag = await exportCurrentBagPNG();               // data:image/png;base64,...
    console.log('[scene] bag length:', bag?.length);

    const url = await composeScene(bag);                   // サーバから dataURL
    console.log('[scene] received url length:', url?.length);

    // ★一時確認：新規タブで直接表示（表示経路の切り分け用）
    window.open(url, '_blank');

    // 画像ロードの成否をログ
    const img = new Image();
    img.onload = () => console.log('[scene] img loaded:', img.naturalWidth, img.naturalHeight);
    img.onerror = (e) => console.error('[scene] img error:', e);
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.src = url;

    out.innerHTML = '';
    out.appendChild(img);

  } catch (e: any) {
    console.error(e);
    out.innerHTML = `<div style="color:#c00;">${e?.message || '生成に失敗しました'}</div>`;
  } finally {
    btn.disabled = false;
  }
});
