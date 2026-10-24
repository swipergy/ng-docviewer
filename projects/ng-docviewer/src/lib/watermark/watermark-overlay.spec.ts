import { TamperReason, WatermarkOverlay } from './watermark-overlay';
import { rasterizeWatermark, WatermarkTile } from './watermark-rasterizer';

describe('WatermarkOverlay', () => {
  let container: HTMLElement;
  let tile: WatermarkTile;
  let reasons: TamperReason[];
  let overlay: WatermarkOverlay;

  const layer = () => container.lastElementChild as HTMLElement;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(async () => {
    container = document.createElement('div');
    container.style.cssText = 'position:relative;width:400px;height:300px';
    container.appendChild(document.createElement('div'));
    document.body.appendChild(container);
    tile = await rasterizeWatermark({ text: 'Test' }, {}, { scale: 1 });
    reasons = [];
  });

  afterEach(() => {
    overlay.destroy();
    container.remove();
  });

  it('legt die Ebene als letztes Kind über den Inhalt', () => {
    overlay = new WatermarkOverlay(container, { protect: true });
    overlay.setTile(tile);
    expect(container.children).toHaveLength(2);
    expect(layer().style.getPropertyValue('pointer-events')).toBe('none');
    expect(layer().style.getPropertyPriority('display')).toBe('important');
    expect(getComputedStyle(layer()).backgroundImage).toContain('data:image/png');
  });

  it('stellt eine entfernte Ebene wieder her', async () => {
    overlay = new WatermarkOverlay(container, { protect: true, onTamper: (r) => reasons.push(r) });
    overlay.setTile(tile);
    layer().remove();
    await flush();
    expect(container.children).toHaveLength(2);
    expect(reasons).toEqual(['removed']);
  });

  it('setzt veränderte Styles zurück', async () => {
    overlay = new WatermarkOverlay(container, { protect: true, onTamper: (r) => reasons.push(r) });
    overlay.setTile(tile);
    layer().style.setProperty('opacity', '0', 'important');
    await flush();
    expect(layer().style.getPropertyValue('opacity')).toBe('1');
    expect(reasons).toEqual(['modified']);
  });

  it('bleibt oben, wenn ein Element darübergelegt wird', async () => {
    overlay = new WatermarkOverlay(container, { protect: true, onTamper: (r) => reasons.push(r) });
    overlay.setTile(tile);
    const wm = layer();
    container.appendChild(document.createElement('div'));
    await flush();
    expect(layer()).toBe(wm);
    expect(reasons).toEqual(['modified']);
  });

  it('meldet keine eigenen Änderungen als Manipulation', async () => {
    overlay = new WatermarkOverlay(container, { protect: true, onTamper: (r) => reasons.push(r) });
    overlay.setTile(tile);
    overlay.setTile(await rasterizeWatermark({ text: 'Neu' }, {}, { scale: 1 }));
    await flush();
    expect(reasons).toEqual([]);
  });

  it('Stylesheets können die Ebene nicht verschieben (margin/padding/border sind festgeschrieben)', async () => {
    overlay = new WatermarkOverlay(container, { protect: true, checkInterval: 10, onTamper: (r) => reasons.push(r) });
    overlay.setTile(tile);
    const style = document.createElement('style');
    style.textContent = `[${Array.from(layer().attributes).find((a) => a.name.startsWith('data-w'))!.name}] { margin-left: 50px !important; padding: 20px !important; border: 10px solid !important; }`;
    document.head.appendChild(style);
    await new Promise((r) => setTimeout(r, 50));
    const [a, b] = [layer().getBoundingClientRect(), container.getBoundingClientRect()];
    style.remove();
    expect([a.left, a.top, a.width, a.height]).toEqual([b.left, b.top, b.width, b.height]);
    expect(reasons).toEqual([]);
  });

  it('erkennt bei der periodischen Prüfung eine verschobene Ebene', async () => {
    overlay = new WatermarkOverlay(container, { protect: true, checkInterval: 10, onTamper: (r) => reasons.push(r) });
    overlay.setTile(tile);
    // Steht für künftige CSS-Eigenschaften, die die Style-Sperre nicht kennt.
    const real = container.getBoundingClientRect();
    vi.spyOn(layer(), 'getBoundingClientRect').mockReturnValue(new DOMRect(real.left + 50, real.top, real.width, real.height));
    await new Promise((r) => setTimeout(r, 50));
    expect(reasons).toContain('hidden');
  });

  it('ohne Schutz keine Wiederherstellung', async () => {
    overlay = new WatermarkOverlay(container, { protect: false, onTamper: (r) => reasons.push(r) });
    overlay.setTile(tile);
    layer().remove();
    await flush();
    expect(container.children).toHaveLength(1);
    expect(reasons).toEqual([]);
  });
});
