import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import type { PhrasingContent, RootContent } from 'mdast';

export type DocFormat = 'pdf' | 'docx' | 'md';

// ---------------------------------------------------------------------------
// Markdown -> small intermediate representation shared by both renderers
// ---------------------------------------------------------------------------
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
}

export type Block =
  | { t: 'h'; level: number; runs: Run[] }
  | { t: 'p'; runs: Run[]; indent: number; marker?: string; quote?: boolean }
  | { t: 'code'; text: string }
  | { t: 'table'; rows: Run[][][] }
  | { t: 'hr' };

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** Roboto (bundled with pdfmake) has no emoji glyphs; drop them rather than print boxes. */
export const stripEmoji = (s: string) => s.replace(EMOJI_RE, '').replace(/ {2,}/g, ' ');

type Marks = Omit<Run, 'text'>;

function runsOf(nodes: PhrasingContent[], marks: Marks = {}): Run[] {
  const out: Run[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out.push({ text: n.value, ...marks });
        break;
      case 'strong':
        out.push(...runsOf(n.children, { ...marks, bold: true }));
        break;
      case 'emphasis':
        out.push(...runsOf(n.children, { ...marks, italic: true }));
        break;
      case 'delete':
        out.push(...runsOf(n.children, { ...marks, strike: true }));
        break;
      case 'inlineCode':
        out.push({ text: n.value, ...marks, code: true });
        break;
      case 'link':
        out.push(...runsOf(n.children, { ...marks, link: n.url }));
        break;
      case 'break':
        out.push({ text: '\n', ...marks });
        break;
      case 'image':
        if (n.alt) out.push({ text: n.alt, ...marks });
        break;
      default:
        break; // html, footnote refs, etc.
    }
  }
  return out;
}

const plain = (runs: Run[]) => runs.map((r) => r.text).join('');

function walk(node: RootContent, indent: number, quote: boolean, out: Block[]) {
  switch (node.type) {
    case 'heading':
      out.push({ t: 'h', level: Math.min(node.depth, 6), runs: runsOf(node.children) });
      break;
    case 'paragraph':
      out.push({ t: 'p', runs: runsOf(node.children), indent, quote });
      break;
    case 'list': {
      const start = node.start ?? 1;
      node.children.forEach((item, i) => {
        // Task-list items keep a text checkbox (Roboto has no ballot-box glyphs).
        const marker =
          typeof item.checked === 'boolean' ? (item.checked ? '[x]' : '[ ]') : node.ordered ? `${start + i}.` : '•';
        let first = true;
        for (const child of item.children) {
          if (first && child.type === 'paragraph') {
            out.push({ t: 'p', runs: runsOf(child.children), indent: indent + 1, marker, quote });
          } else {
            walk(child, indent + 1, quote, out);
          }
          first = false;
        }
      });
      break;
    }
    case 'blockquote':
      for (const child of node.children) walk(child, indent, true, out);
      break;
    case 'code':
      out.push({ t: 'code', text: node.value });
      break;
    case 'table':
      out.push({
        t: 'table',
        rows: node.children.map((row) => row.children.map((cell) => runsOf(cell.children))),
      });
      break;
    case 'thematicBreak':
      out.push({ t: 'hr' });
      break;
    default:
      break;
  }
}

export function parseMarkdown(md: string): Block[] {
  const tree = fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const out: Block[] = [];
  for (const node of tree.children) walk(node, 0, false, out);
  return out;
}

/** Title from the first H1 (or first heading), else the first line, else "document". */
export function docTitle(md: string): string {
  const blocks = parseMarkdown(md);
  const h = blocks.find((b) => b.t === 'h' && b.level === 1) ?? blocks.find((b) => b.t === 'h');
  const text = h && h.t === 'h' ? plain(h.runs) : (md.split('\n').find((l) => l.trim()) ?? '');
  return text.replace(/[#*_`]/g, '').trim().slice(0, 80) || 'Document';
}

export function fileSlug(title: string): string {
  const s = stripEmoji(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return s || 'document';
}

// ---------------------------------------------------------------------------
// PDF (pdfmake): real vector text
// ---------------------------------------------------------------------------
const HEADING_SIZE = [0, 22, 17, 14, 12.5, 11.5, 11];

function pdfRuns(runs: Run[]) {
  return runs.map((r) => ({
    text: stripEmoji(r.text),
    bold: r.bold,
    italics: r.italic,
    decoration: r.link ? 'underline' : r.strike ? 'lineThrough' : undefined,
    color: r.link ? '#2563eb' : undefined,
    link: r.link,
    background: r.code ? '#f3eef0' : undefined,
    fontSize: r.code ? 10 : undefined,
  }));
}

export function toPdfDefinition(md: string) {
  const content: unknown[] = [];
  for (const b of parseMarkdown(md)) {
    switch (b.t) {
      case 'h':
        content.push({
          text: pdfRuns(b.runs),
          fontSize: HEADING_SIZE[b.level],
          bold: true,
          color: b.level === 1 ? '#c2185b' : '#2d2a32',
          margin: [0, b.level === 1 ? 0 : 10, 0, 6],
        });
        break;
      case 'p': {
        const runs = pdfRuns(b.runs);
        content.push({
          text: b.marker ? [{ text: `${b.marker} ` }, ...runs] : runs,
          margin: [b.indent * 16, 0, 0, b.marker ? 3 : 7],
          ...(b.quote ? { italics: true, color: '#5b5560' } : {}),
        });
        break;
      }
      case 'code':
        content.push({
          table: { widths: ['*'], body: [[{ text: stripEmoji(b.text), fontSize: 9, margin: [6, 4, 6, 4] }]] },
          layout: { fillColor: () => '#f3eef0', hLineWidth: () => 0, vLineWidth: () => 0 },
          margin: [0, 0, 0, 8],
        });
        break;
      case 'table': {
        const cols = Math.max(1, ...b.rows.map((r) => r.length));
        content.push({
          table: {
            headerRows: 1,
            widths: Array(cols).fill('*'),
            body: b.rows.map((row, ri) =>
              Array.from({ length: cols }, (_, ci) => ({
                text: pdfRuns(row[ci] ?? []),
                bold: ri === 0,
                fillColor: ri === 0 ? '#fde4ee' : undefined,
                margin: [3, 2, 3, 2],
              }))
            ),
          },
          layout: 'lightHorizontalLines',
          margin: [0, 2, 0, 10],
        });
        break;
      }
      case 'hr':
        content.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.7, lineColor: '#d9c9d1' }],
          margin: [0, 6, 0, 10],
        });
        break;
    }
  }
  return {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    defaultStyle: { fontSize: 11, lineHeight: 1.25, color: '#2d2a32' },
    content,
  };
}

interface PdfMakeLike {
  addVirtualFileSystem: (vfs: unknown) => void;
  createPdf: (def: unknown) => { getBlob: () => Promise<Blob> };
}

export async function makePdfBlob(md: string): Promise<Blob> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default as unknown as PdfMakeLike;
  const vfs = (await import('pdfmake/build/vfs_fonts')).default as unknown;
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake.createPdf(toPdfDefinition(md)).getBlob();
}

// ---------------------------------------------------------------------------
// DOCX (docx library)
// ---------------------------------------------------------------------------
export async function makeDocxBlob(md: string): Promise<Blob> {
  const d = await import('docx');
  const headings = [
    d.HeadingLevel.HEADING_1,
    d.HeadingLevel.HEADING_1,
    d.HeadingLevel.HEADING_2,
    d.HeadingLevel.HEADING_3,
    d.HeadingLevel.HEADING_4,
    d.HeadingLevel.HEADING_5,
    d.HeadingLevel.HEADING_6,
  ];

  const runsToDocx = (runs: Run[], extra: { italics?: boolean; color?: string } = {}) =>
    runs.map((r) => {
      const run = new d.TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic || extra.italics,
        strike: r.strike,
        font: r.code ? 'Consolas' : undefined,
        shading: r.code ? { type: d.ShadingType.CLEAR, fill: 'F3EEF0', color: 'auto' } : undefined,
        color: r.link ? '2563EB' : extra.color,
        underline: r.link ? {} : undefined,
        break: undefined,
      });
      return r.link ? new d.ExternalHyperlink({ link: r.link, children: [run] }) : run;
    });

  const children: Array<InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>> = [];
  for (const b of parseMarkdown(md)) {
    switch (b.t) {
      case 'h':
        children.push(new d.Paragraph({ heading: headings[b.level], children: runsToDocx(b.runs), spacing: { before: 200, after: 100 } }));
        break;
      case 'p':
        children.push(
          new d.Paragraph({
            children: [
              ...(b.marker ? [new d.TextRun({ text: `${b.marker} ` })] : []),
              ...runsToDocx(b.runs, b.quote ? { italics: true, color: '5B5560' } : {}),
            ],
            indent: b.indent ? { left: 360 * b.indent } : undefined,
            spacing: { after: b.marker ? 60 : 140 },
          })
        );
        break;
      case 'code':
        for (const line of b.text.split('\n')) {
          children.push(
            new d.Paragraph({
              children: [new d.TextRun({ text: line || ' ', font: 'Consolas', size: 19 })],
              shading: { type: d.ShadingType.CLEAR, fill: 'F3EEF0', color: 'auto' },
              spacing: { after: 0 },
            })
          );
        }
        children.push(new d.Paragraph({ children: [], spacing: { after: 120 } }));
        break;
      case 'table': {
        const cols = Math.max(1, ...b.rows.map((r) => r.length));
        children.push(
          new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            rows: b.rows.map(
              (row, ri) =>
                new d.TableRow({
                  tableHeader: ri === 0,
                  children: Array.from({ length: cols }, (_, ci) =>
                    new d.TableCell({
                      shading: ri === 0 ? { type: d.ShadingType.CLEAR, fill: 'FDE4EE', color: 'auto' } : undefined,
                      children: [
                        new d.Paragraph({
                          children: runsToDocx((row[ci] ?? []).map((r) => (ri === 0 ? { ...r, bold: true } : r))),
                        }),
                      ],
                    })
                  ),
                })
            ),
          })
        );
        children.push(new d.Paragraph({ children: [], spacing: { after: 120 } }));
        break;
      }
      case 'hr':
        children.push(
          new d.Paragraph({
            children: [],
            border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'D9C9D1', space: 1 } },
            spacing: { after: 160 },
          })
        );
        break;
    }
  }

  const doc = new d.Document({
    creator: 'Sakura Chat',
    title: docTitle(md),
    sections: [{ children }],
  });
  return d.Packer.toBlob(doc);
}

// ---------------------------------------------------------------------------
// Download entry point
// ---------------------------------------------------------------------------
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Builds the requested format from markdown and triggers a browser download. */
export async function exportDocument(md: string, format: DocFormat): Promise<void> {
  const slug = fileSlug(docTitle(md));
  if (format === 'md') {
    saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug}.md`);
  } else if (format === 'pdf') {
    saveBlob(await makePdfBlob(md), `${slug}.pdf`);
  } else {
    saveBlob(await makeDocxBlob(md), `${slug}.docx`);
  }
}
