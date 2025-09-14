// lib/api.ts
const API_BASE = import.meta.env.VITE_SCENE_API?.replace(/\/$/, '');

export async function composeScene(pngDataUrl: string) {
  if (!API_BASE) {
    throw new Error('VITE_SCENE_API が未設定です。環境変数に外部APIのベースURLを設定してください。');
  }
  const res = await fetch(`${API_BASE}/compose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: pngDataUrl }),
  });

  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Scene API error: ${res.status} ${res.statusText} ${text.slice(0,200)}`);
  }

  if (ct.includes('application/json')) {
    return await res.json(); // { url: "..."} 等
  } else if (ct.startsWith('image/')) {
    const blob = await res.blob();
    return { imageBlob: blob };
  } else {
    const text = await res.text().catch(() => '');
    throw new Error(`Unexpected content-type: ${ct}. Body: ${text.slice(0,200)}`);
  }
}
