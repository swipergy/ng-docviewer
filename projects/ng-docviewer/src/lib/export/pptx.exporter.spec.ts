import JSZip from 'jszip';
import { rasterizeWatermark } from '../watermark/watermark-rasterizer';
import { exportPptx } from './pptx.exporter';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

async function samplePptx(extLst = ''): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/></Types>');
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${P}"><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`);
  for (const n of [1, 2]) {
    zip.file(
      `ppt/slides/slide${n}.xml`,
      `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:sp><p:nvSpPr><p:cNvPr id="${n + 4}" name="Titel"/></p:nvSpPr></p:sp>${extLst}</p:spTree></p:cSld></p:sld>`,
    );
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('exportPptx', () => {
  it('legt ein gesperrtes Bild mit eindeutiger ID oben auf jede Folie', async () => {
    const tile = await rasterizeWatermark({ text: 'Test' }, {}, { scale: 1 });
    const zip = await JSZip.loadAsync(await (await exportPptx(await samplePptx(), tile)).arrayBuffer());
    for (const n of [1, 2]) {
      const xml = await zip.file(`ppt/slides/slide${n}.xml`)!.async('string');
      expect(xml).toContain(`<p:cNvPr id="${n + 5}" name="sy-watermark"`);
      expect(xml).toMatch(/<\/p:pic><\/p:spTree>/);
      expect(xml).toContain('<a:ext cx="9144000" cy="6858000"/>');
      expect(xml).toContain('xmlns:r=');
      const rels = await zip.file(`ppt/slides/_rels/slide${n}.xml.rels`)!.async('string');
      expect(rels).toContain('Id="rIdSyWatermark"');
    }
    expect(zip.file('ppt/media/sy-watermark.png')).toBeTruthy();
    const types = await zip.file('[Content_Types].xml')!.async('string');
    expect(types.match(/Extension="png"/g)).toHaveLength(1);
  });

  it('hält das abschließende extLst von spTree am Ende (Schema)', async () => {
    const tile = await rasterizeWatermark({ text: 'Test' }, {}, { scale: 1 });
    const ext = '<p:extLst><p:ext uri="{X}"/></p:extLst>';
    const zip = await JSZip.loadAsync(await (await exportPptx(await samplePptx(ext), tile)).arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain(`</p:pic>${ext}</p:spTree>`);
  });
});
