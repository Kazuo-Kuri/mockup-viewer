export async function composeScene(bagDataUrl: string): Promise<string> {
  const res = await fetch('/compose_scene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bag_png_data_url: bagDataUrl, scene_id: 'cafe' })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'compose failed');
  return json.image_data_url as string; // data:image/png;base64,...
}
