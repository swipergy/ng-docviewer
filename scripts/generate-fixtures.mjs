// Erzeugt Beispieldateien aller unterstützten Formate für Demo-App und E2E-Tests.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, PageBreak, Table, TableRow, TableCell } from 'docx';

const out = join(import.meta.dirname, '..', 'projects', 'demo', 'public', 'samples');
mkdirSync(out, { recursive: true });

async function pdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Swipergy Beispiel-PDF – Seite ${i}`, { x: 50, y: 780, size: 22, font, color: rgb(0.1, 0.2, 0.5) });
    for (let l = 0; l < 30; l++) {
      page.drawText(`Zeile ${l + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`, { x: 50, y: 730 - l * 22, size: 11, font });
    }
  }
  writeFileSync(join(out, 'sample.pdf'), await doc.save());
}

async function pptx() {
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_16x9';
  const s1 = p.addSlide();
  s1.background = { color: '1E3A8A' };
  s1.addText('Swipergy Präsentation', { x: 0.5, y: 2, w: 9, h: 1.2, fontSize: 40, color: 'FFFFFF', bold: true, align: 'center' });
  const s2 = p.addSlide();
  s2.addText('Agenda', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1E3A8A' });
  s2.addText([{ text: 'Ziele' }, { text: 'Roadmap' }, { text: 'Zahlen' }].map((t) => ({ ...t, options: { bullet: true } })), { x: 0.8, y: 1.4, w: 8, h: 2.5, fontSize: 20 });
  s2.addShape(p.ShapeType.rect, { x: 6.5, y: 3.5, w: 3, h: 1.5, fill: { color: 'F59E0B' } });
  const s3 = p.addSlide();
  s3.addText('Tabelle', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true });
  s3.addTable([[{ text: 'Q1' }, { text: 'Q2' }, { text: 'Q3' }], [{ text: '10' }, { text: '20' }, { text: '30' }]], { x: 0.5, y: 1.5, w: 9, fontSize: 16, border: { type: 'solid', color: '999999', pt: 1 } });
  writeFileSync(join(out, 'sample.pptx'), Buffer.from(await p.write({ outputType: 'arraybuffer' })));
}

async function docx() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Swipergy Beispiel-Dokument', heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun('Dies ist ein '), new TextRun({ text: 'Word-Dokument', bold: true }), new TextRun(' mit mehreren Seiten.')] }),
        ...Array.from({ length: 12 }, (_, i) => new Paragraph(`Absatz ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`)),
        new Table({ rows: [['Name', 'Wert'], ['A', '1'], ['B', '2']].map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph(c)] })) })) }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: 'Seite 2', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Weiterer Inhalt auf der zweiten Seite.'),
      ],
    }],
  });
  writeFileSync(join(out, 'sample.docx'), await Packer.toBuffer(doc));
}

function media() {
  const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x800:duration=1', '-frames:v', '1', join(out, 'sample.png'));
  ff('-f', 'lavfi', '-i', 'smptehdbars=size=1280x720', '-frames:v', '1', '-q:v', '3', join(out, 'sample.jpg'));
  const aiff = join(out, 'tmp.aiff');
  execFileSync('say', ['-v', 'Anna', '-o', aiff, 'Dies ist eine Audio-Beispieldatei von Swipergy.']);
  ff('-i', aiff, '-codec:a', 'libmp3lame', '-q:a', '5', join(out, 'sample.mp3'));
  if (existsSync(aiff)) rmSync(aiff);
}

await Promise.all([pdf(), pptx(), docx()]);
media();
console.log('Fixtures geschrieben nach', out);
