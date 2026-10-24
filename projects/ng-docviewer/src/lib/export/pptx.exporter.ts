import { WatermarkTile, watermarkSheetPng } from '../watermark/watermark-rasterizer';
import { appendToSpTree, ensureNamespaces, readSlideSize, Relationships, REL_TYPE_IMAGE, updateContentTypes } from './ooxml';

const EMU_PER_PX = 9525;

/** Legt das Wasserzeichen als gesperrtes Bild über jede Folie. */
export async function exportPptx(data: ArrayBuffer, tile: WatermarkTile): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  const { cx, cy } = await readSlideSize(zip);
  const mediaPath = 'ppt/media/sy-watermark.png';
  zip.file(mediaPath, await watermarkSheetPng(tile, cx / EMU_PER_PX, cy / EMU_PER_PX));

  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const slide of slides) {
    const rels = await Relationships.load(zip, slide);
    const rId = rels.add(REL_TYPE_IMAGE, '../media/sy-watermark.png', 'rIdSyWatermark');
    rels.save(zip);
    let xml = await zip.file(slide)!.async('string');
    const nextId = Math.max(0, ...Array.from(xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g), (m) => Number(m[1]))) + 1;
    xml = ensureNamespaces(xml, 'p:sld', ['a', 'r']);
    // Als letzte Form in spTree → liegt über allen anderen Formen.
    xml = appendToSpTree(xml, picture(rId, nextId, cx, cy));
    zip.file(slide, xml);
  }
  await updateContentTypes(zip);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
}

function picture(rId: string, id: number, cx: number, cy: number): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="sy-watermark" descr="Watermark"/>` +
    `<p:cNvPicPr><a:picLocks noGrp="1" noSelect="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1" noCrop="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

