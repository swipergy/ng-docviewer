import JSZip from 'jszip';
import { appendToSpTree, attr, ensureNamespaces, readSlideSize, Relationships, relsPathFor, resolveTarget } from './ooxml';

describe('ooxml helpers', () => {
  it('berechnet Rels-Pfade und löst Targets auf', () => {
    expect(relsPathFor('word/document.xml')).toBe('word/_rels/document.xml.rels');
    expect(resolveTarget('word/document.xml', 'header1.xml')).toBe('word/header1.xml');
    expect(resolveTarget('ppt/slides/slide1.xml', '../media/a.png')).toBe('ppt/media/a.png');
    expect(resolveTarget('word/document.xml', '/word/x.xml')).toBe('word/x.xml');
  });

  it('vergibt eindeutige Relationship-IDs', async () => {
    const zip = new JSZip();
    zip.file(
      'word/_rels/document.xml.rels',
      '<Relationships xmlns="x"><Relationship Id="rId1" Type="t" Target="a"/><Relationship Id="rId3" Type="t" Target="b"/></Relationships>',
    );
    const rels = await Relationships.load(zip, 'word/document.xml');
    const a = rels.add('t', 'c');
    const b = rels.add('t', 'd', 'rIdCustom');
    const c = rels.add('t', 'e', 'rIdCustom');
    expect(new Set(['rId1', 'rId3', a, b, c]).size).toBe(5);
    expect(b).toBe('rIdCustom');
    expect(rels.get(a)?.target).toBe('c');
  });

  it('legt eine fehlende Rels-Datei an', async () => {
    const zip = new JSZip();
    const rels = await Relationships.load(zip, 'ppt/slides/slide1.xml');
    rels.add('t', 'x');
    rels.save(zip);
    expect(await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string')).toContain('Target="x"');
  });

  it('ergänzt nur fehlende Namespaces', () => {
    const xml = ensureNamespaces('<w:hdr xmlns:w="w" xmlns:r="r"><w:p/></w:hdr>', 'w:hdr', ['r', 'wp']);
    expect(xml.match(/xmlns:r=/g)).toHaveLength(1);
    expect(xml).toContain('xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"');
  });

  it('liest Attribute unabhängig von Quote-Art und Reihenfolge', () => {
    expect(attr(`<x a="it's" b='c'/>`, 'a')).toBe("it's");
    expect(attr(`<x a="it's" b='c'/>`, 'b')).toBe('c');
    expect(attr('<w:x w:val = "1"/>', 'w:val')).toBe('1');
  });

  it('liest die Foliengröße auch bei vertauschten Attributen', async () => {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<p:presentation><p:sldSz type="screen4x3" cy="6858000" cx="9144000"/></p:presentation>');
    expect(await readSlideSize(zip)).toEqual({ cx: 9144000, cy: 6858000 });
    expect(await readSlideSize(new JSZip())).toEqual({ cx: 12192000, cy: 6858000 });
  });

  it('fügt in spTree vor dessen abschließendem extLst ein', () => {
    const own = '<p:spTree><p:sp><p:extLst><p:ext/></p:extLst></p:sp><p:extLst><p:ext/></p:extLst></p:spTree>';
    expect(appendToSpTree(own, '<X/>')).toBe('<p:spTree><p:sp><p:extLst><p:ext/></p:extLst></p:sp><X/><p:extLst><p:ext/></p:extLst></p:spTree>');
    // extLst einer Form am Ende bleibt unberührt
    const shapeOnly = '<p:spTree><p:sp><p:extLst/></p:sp></p:spTree>';
    expect(appendToSpTree(shapeOnly, '<X/>')).toBe('<p:spTree><p:sp><p:extLst/></p:sp><X/></p:spTree>');
  });
});
