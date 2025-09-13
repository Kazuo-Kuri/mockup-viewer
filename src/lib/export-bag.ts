export async function exportCurrentBagPNG(): Promise<string> {
  // ここは既存の「PNGで保存」と同じ処理にしてください。
  // Canvas or Renderer から dataURL を返す。
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  return canvas.toDataURL("image/png");
}
