import { exportCurrentBagPNG } from '../lib/export-bag';
import { composeScene } from '../lib/api';

const btn = document.getElementById('btn-cafe') as HTMLButtonElement;
const out = document.getElementById('scene-out') as HTMLDivElement;

btn.addEventListener('click', async () => {
  btn.disabled = true;
  out.textContent = '生成中…';
  try {
    const bag = await exportCurrentBagPNG();
    const url = await composeScene(bag);
    out.innerHTML = `<img src="${url}" style="max-width:100%;height:auto;">`;
  } catch (e: any) {
    out.textContent = e.message || '生成に失敗しました';
  } finally {
    btn.disabled = false;
  }
});
