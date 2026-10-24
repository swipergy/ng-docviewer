import { paintWatermark, rasterizeWatermark } from './watermark-rasterizer';

describe('rasterizeWatermark', () => {
  it('skaliert das Canvas mit dem Faktor', async () => {
    const tile = await rasterizeWatermark({ text: 'Test', angle: 0, gap: 0 }, {}, { scale: 2 });
    expect(tile.canvas.width).toBe(Math.round(tile.width * 2));
    expect(tile.canvas.height).toBe(Math.round(tile.height * 2));
    expect(tile.layout).toBe('tile');
  });

  it('vergrößert die Kachel um den Abstand und die Rotation', async () => {
    const flat = await rasterizeWatermark({ text: 'Wasserzeichen', angle: 0, gap: 0 }, {}, { scale: 1 });
    const gapped = await rasterizeWatermark({ text: 'Wasserzeichen', angle: 0, gap: 50 }, {}, { scale: 1 });
    const rotated = await rasterizeWatermark({ text: 'Wasserzeichen', angle: -45, gap: 0 }, {}, { scale: 1 });
    expect(gapped.width - flat.width).toBe(50);
    expect(rotated.height).toBeGreaterThan(flat.height);
  });

  it('zeichnet sichtbare Pixel', async () => {
    const tile = await rasterizeWatermark({ text: 'XXXX', opacity: 1, color: '#f00', angle: 0, gap: 0, fontSize: 40 }, {}, { scale: 1 });
    const data = tile.canvas.getContext('2d')!.getImageData(0, 0, tile.canvas.width, tile.canvas.height).data;
    let red = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 3] > 200) red++;
    expect(red).toBeGreaterThan(50);
  });

  it('lädt Bilder und kombiniert sie mit Text', async () => {
    const svg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="blue"/></svg>')}`;
    const withImage = await rasterizeWatermark({ text: 'A', image: svg, imageWidth: 100, angle: 0, gap: 0 }, {}, { scale: 1 });
    expect(withImage.height).toBeGreaterThan(50);
  });

  it('meldet nicht ladbare Bilder', async () => {
    await expect(rasterizeWatermark({ image: '/gibt-es-nicht.png' })).rejects.toMatchObject({ code: 'watermarkImage', params: { src: '/gibt-es-nicht.png' } });
  });

  it('kommt mit SVG-Logos ohne eigene Größe zurecht', async () => {
    const svg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>')}`;
    const tile = await rasterizeWatermark({ image: svg, imageWidth: 80, angle: 0, gap: 0 }, {}, { scale: 1 });
    expect(Number.isFinite(tile.width) && Number.isFinite(tile.height)).toBe(true);
    expect(tile.height).toBeGreaterThan(0);
    expect(tile.canvas.width).toBeGreaterThan(1);
  });
});

describe('paintWatermark', () => {
  it('kachelt über die gesamte Fläche', async () => {
    const tile = await rasterizeWatermark({ text: 'X', opacity: 1, angle: 0, gap: 10 }, {}, { scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = tile.width * 3;
    canvas.height = tile.height * 3;
    const ctx = canvas.getContext('2d')!;
    const spy = vi.spyOn(ctx, 'drawImage');
    paintWatermark(ctx, tile, canvas.width, canvas.height);
    expect(spy).toHaveBeenCalledTimes(9);
  });

  it('zeichnet bei `center` genau einmal', async () => {
    const tile = await rasterizeWatermark({ text: 'X', layout: 'center' }, {}, { scale: 1 });
    const ctx = document.createElement('canvas').getContext('2d')!;
    const spy = vi.spyOn(ctx, 'drawImage');
    paintWatermark(ctx, tile, 1000, 1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
