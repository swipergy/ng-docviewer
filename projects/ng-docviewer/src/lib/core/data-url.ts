/**
 * Liefert eine `data:`-URL für einen Blob. Statt `blob:`, weil strenge Content Security
 * Policies `img-src` oft auf `'self' data:` beschränken und `blob:`-Bilder dann blockieren.
 */
export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
