// Evaluation Word (.docx) export — professional format with EIU CDS branding
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS, CORE_FUNCTIONS } from '../../utils/competencies.js';
import { branding } from '../../config/branding.js';

let docxLib = null;

async function loadDocx() {
  if (docxLib) return docxLib;
  if (window.docx) { docxLib = window.docx; return docxLib; }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';
    script.onload = () => { docxLib = window.docx; resolve(docxLib); };
    script.onerror = () => reject(new Error('Failed to load docx library'));
    document.head.appendChild(script);
  });
}

async function loadLogoData() {
  try {
    const resp = await fetch('assets/eiu-cds-logo.png');
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch { return null; }
}

// ── Color constants ────────────────────────────────────────────────────────

const BLUE        = '003087';  // EIU Panther Blue
const WHITE       = 'FFFFFF';
const LIGHT_BLUE  = 'E8EFF8';  // Table header background
const GRAY_TEXT   = '6B7280';
const DARK_TEXT   = '111827';
const MED_TEXT    = '374151';

function ratingColors(val) {
  if (val === null || val === undefined || val === '') return { bg: WHITE,     fg: '9CA3AF' };
  if (val === 'na')  return { bg: 'F3F4F6', fg: GRAY_TEXT };
  const v = parseFloat(val);
  if (v <= 1.5) return { bg: 'FEF3C7', fg: '92400E' };  // Emerging — amber
  if (v <= 2.5) return { bg: 'F3F4F6', fg: MED_TEXT  };  // Developing — gray
  return           { bg: 'D1FAE5', fg: '065F46' };        // Established — green
}

function gradeColor(g) {
  if (g === 'A') return '065F46';
  if (g === 'B') return '1E40AF';
  if (g === 'C') return '92400E';
  return GRAY_TEXT;
}

function fmtRating(val) {
  if (val === null || val === undefined) return '—';
  if (val === 'na') return 'N/A';
  return String(val);
}

function avgOf(ratings, period) {
  const vals = Object.values(ratings)
    .map((r) => r[period])
    .filter((v) => v !== null && v !== undefined && v !== 'na');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmtAvg(v) {
  return v !== null && v !== undefined ? v.toFixed(2) : '—';
}

function calcGrade(avg) {
  if (avg === null || avg === undefined) return '—';
  if (avg >= 2.4)  return 'A';
  if (avg >= 1.86) return 'B';
  if (avg >= 1.0)  return 'C';
  return '—';
}

// ── Layout constants (US Letter, 1" margins → 9360 DXA content width) ──────

const CONTENT_W = 9360;

// Competency table columns
const CW_ID   =  480;
const CW_DESC = 7350;
const CW_MID  =  765;
const CW_FIN  =  765;
// CW_ID + CW_DESC + CW_MID + CW_FIN = 9360

// Overall table columns
const OW_LBL  = 7200;
const OW_VAL  = 1080;
// OW_LBL + OW_VAL + OW_VAL = 9360

// Core Functions table columns
const CF_TEXT   = 5760;
const CF_DOMAIN = 1800;
const CF_FLAG   =  900;
// CF_TEXT + CF_DOMAIN + CF_FLAG + CF_FLAG = 9360

// ── Border helpers ─────────────────────────────────────────────────────────

function bdr(color = 'D1D5DB') {
  const s = { style: 'single', size: 1, color };
  return { top: s, bottom: s, left: s, right: s };
}

function noBdr() {
  const s = { style: 'none', size: 0, color: WHITE };
  return { top: s, bottom: s, left: s, right: s };
}

// ── Cell / row builders ────────────────────────────────────────────────────

function cell(lib, children, width, opts = {}) {
  const { bg = WHITE, align = 'left', vAlign, noB = false, pad = [80, 80, 120, 120] } = opts;
  const { TableCell, WidthType, ShadingType, VerticalAlign } = lib;
  return new TableCell({
    borders:  noB ? noBdr() : bdr(opts.borderColor),
    shading:  { fill: bg, type: ShadingType.CLEAR },
    width:    { size: width, type: WidthType.DXA },
    verticalAlign: vAlign || VerticalAlign.CENTER,
    margins:  { top: pad[0], bottom: pad[1], left: pad[2], right: pad[3] },
    children,
  });
}

function para(lib, runs, opts = {}) {
  const { spacing = {}, align } = opts;
  const { Paragraph, AlignmentType } = lib;
  return new Paragraph({
    children: runs,
    alignment: align === 'center' ? AlignmentType.CENTER
             : align === 'right'  ? AlignmentType.RIGHT
             : AlignmentType.LEFT,
    spacing,
  });
}

function run(lib, text, opts = {}) {
  const { bold = false, size = 20, color = DARK_TEXT, italics = false } = opts;
  return new lib.TextRun({ text, bold, size, color, italics });
}

// ── Reusable section divider ───────────────────────────────────────────────

function sectionHeader(lib, text) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, ShadingType } = lib;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [
      new TableCell({
        borders: noBdr(),
        shading: { fill: BLUE, type: ShadingType.CLEAR },
        width: { size: CONTENT_W, type: WidthType.DXA },
        margins: { top: 100, bottom: 100, left: 180, right: 180 },
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, size: 24, color: WHITE })],
        })],
      }),
    ]})],
  });
}

function spacer(lib, pts = 120) {
  return new lib.Paragraph({ text: '', spacing: { before: pts, after: 0 } });
}

// ── Competency table ───────────────────────────────────────────────────────

function buildCompetencyTable(lib, competencies, ratings) {
  const { Table, TableRow, WidthType, AlignmentType, VerticalAlign } = lib;

  // Header row
  function hCell(text, width) {
    return cell(lib,
      [para(lib, [run(lib, text, { bold: true, size: 18, color: BLUE })], { align: 'center' })],
      width, { bg: LIGHT_BLUE, borderColor: 'BFDBFE' }
    );
  }

  const headerRow = new TableRow({ tableHeader: true, children: [
    hCell('#',           CW_ID),
    hCell('Competency',  CW_DESC),
    hCell('Midterm',     CW_MID),
    hCell('Final',       CW_FIN),
  ]});

  // Data rows
  const dataRows = competencies.map((comp) => {
    const midVal = ratings[comp.id]?.midterm ?? null;
    const finVal = ratings[comp.id]?.final   ?? null;
    const midC   = ratingColors(midVal);
    const finC   = ratingColors(finVal);

    return new TableRow({ children: [
      // ID
      cell(lib,
        [para(lib, [run(lib, comp.id.toUpperCase(), { bold: true, size: 16, color: GRAY_TEXT })], { align: 'center' })],
        CW_ID, { vAlign: VerticalAlign.TOP, pad: [80, 80, 60, 60] }
      ),
      // Label + description
      cell(lib, [
        para(lib, [run(lib, comp.label,       { bold: true, size: 20 })],                              { spacing: { after: 20 } }),
        para(lib, [run(lib, comp.description, { size: 16, color: GRAY_TEXT })]),
      ], CW_DESC, { vAlign: VerticalAlign.TOP }),
      // Midterm
      cell(lib,
        [para(lib, [run(lib, fmtRating(midVal), { bold: true, size: 20, color: midC.fg })], { align: 'center' })],
        CW_MID, { bg: midC.bg, pad: [80, 80, 60, 60] }
      ),
      // Final
      cell(lib,
        [para(lib, [run(lib, fmtRating(finVal), { bold: true, size: 20, color: finC.fg })], { align: 'center' })],
        CW_FIN, { bg: finC.bg, pad: [80, 80, 60, 60] }
      ),
    ]});
  });

  // Average row
  const midAvg = avgOf(ratings, 'midterm');
  const finAvg = avgOf(ratings, 'final');
  const label  = competencies === CLINICAL_SKILLS ? 'Clinical Skills Average' : 'Clinical Foundations Average';

  const avgRow = new TableRow({ children: [
    cell(lib, [new lib.Paragraph({ text: '' })], CW_ID,   { bg: LIGHT_BLUE, borderColor: 'BFDBFE' }),
    cell(lib,
      [para(lib, [run(lib, label, { bold: true, size: 20, color: BLUE })], { align: 'right' })],
      CW_DESC, { bg: LIGHT_BLUE, borderColor: 'BFDBFE' }
    ),
    cell(lib,
      [para(lib, [run(lib, fmtAvg(midAvg), { bold: true, size: 20, color: BLUE })], { align: 'center' })],
      CW_MID, { bg: LIGHT_BLUE, borderColor: 'BFDBFE' }
    ),
    cell(lib,
      [para(lib, [run(lib, fmtAvg(finAvg), { bold: true, size: 20, color: BLUE })], { align: 'center' })],
      CW_FIN, { bg: LIGHT_BLUE, borderColor: 'BFDBFE' }
    ),
  ]});

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CW_ID, CW_DESC, CW_MID, CW_FIN],
    rows: [headerRow, ...dataRows, avgRow],
  });
}

// ── Main export ────────────────────────────────────────────────────────────

export async function exportEvaluationDocx(clinician, evaluation, settings) {
  const lib      = await loadDocx();
  const logoData = await loadLogoData();

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, AlignmentType, WidthType, ShadingType, VerticalAlign,
    BorderStyle, Footer, PageNumber,
  } = lib;

  const supervisor = settings?.supervisor || '';
  const semName    = settings?.name       || '';

  const csAvgMid = avgOf(evaluation.clinicalSkillRatings,        'midterm');
  const csAvgFin = avgOf(evaluation.clinicalSkillRatings,        'final');
  const cfAvgMid = avgOf(evaluation.clinicalFoundationRatings,   'midterm');
  const cfAvgFin = avgOf(evaluation.clinicalFoundationRatings,   'final');

  function totalAvg(a, b) {
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    return (a + b) / 2;
  }

  const totMid = totalAvg(csAvgMid, cfAvgMid);
  const totFin = totalAvg(csAvgFin, cfAvgFin);
  const gMid   = calcGrade(totMid);
  const gFin   = calcGrade(totFin);

  // ── Document header (logo + title) ────────────────────────────────────────

  const headerBlock = [];

  if (logoData) {
    headerBlock.push(new Paragraph({
      children: [new ImageRun({
        type: 'png',
        data: logoData,
        transformation: { width: 200, height: 67 },
        altText: { title: 'EIU CDS Logo', description: 'EIU CDS Logo', name: 'Logo' },
      })],
      spacing: { before: 0, after: 100 },
    }));
  }

  headerBlock.push(
    new Paragraph({
      children: [new TextRun({ text: 'CDS 4900/5900 Midterm/Final Evaluation', bold: true, size: 36, color: BLUE })],
      spacing: { before: 0, after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Department of ${branding.departmentName}  ·  ${branding.universityName}`, size: 22, color: GRAY_TEXT })],
      spacing: { before: 0, after: 200 },
    }),
    // Blue rule
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: BLUE, space: 1 } },
      spacing: { before: 0, after: 200 },
      text: '',
    }),
  );

  // ── Info grid (2-col table) ────────────────────────────────────────────────

  function infoCell(label, value, rightPad = false) {
    return new TableCell({
      borders: noBdr(),
      width: { size: CONTENT_W / 2, type: WidthType.DXA },
      margins: { top: 40, bottom: 40, left: rightPad ? 240 : 0, right: 0 },
      children: [new Paragraph({
        children: [
          new TextRun({ text: label + ':  ', bold: true, size: 20, color: MED_TEXT }),
          new TextRun({ text: value || '—',             size: 20, color: DARK_TEXT }),
        ],
      })],
    });
  }

  const infoTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    rows: [
      new TableRow({ children: [infoCell('Clinician', clinician.name),              infoCell('Client',     clinician.clientInitials, true)] }),
      new TableRow({ children: [infoCell('Supervisor', supervisor),                 infoCell('Semester',   semName,                  true)] }),
      new TableRow({ children: [infoCell('Midterm Date', evaluation.midtermDate),   infoCell('Final Date', evaluation.finalDate,      true)] }),
    ],
  });

  const infoRule = new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
    spacing: { before: 180, after: 180 },
    text: '',
  });

  // ── Rating legend ──────────────────────────────────────────────────────────

  const legend = new Paragraph({
    children: [
      new TextRun({ text: 'Rating Scale:  ', bold: true, size: 18, color: MED_TEXT }),
      new TextRun({ text: '3 = Established  ', size: 18, color: '065F46' }),
      new TextRun({ text: '|  ',               size: 18, color: '9CA3AF' }),
      new TextRun({ text: '2 = Developing  ',  size: 18, color: MED_TEXT }),
      new TextRun({ text: '|  ',               size: 18, color: '9CA3AF' }),
      new TextRun({ text: '1 = Emerging       ',  size: 18, color: '92400E' }),
      new TextRun({ text: 'Grades:  ', bold: true, size: 18, color: MED_TEXT }),
      new TextRun({ text: 'A = 2.4–3.0  |  B = 1.86–2.39  |  C = 1.0–1.85', size: 18, color: MED_TEXT }),
    ],
    spacing: { before: 0, after: 240 },
  });

  // ── Overall table ──────────────────────────────────────────────────────────

  function oCell(text, width, opts = {}) {
    const { bg = WHITE, color = DARK_TEXT, bold = false, align = 'center' } = opts;
    return cell(lib,
      [para(lib, [run(lib, text, { bold, size: bold ? 24 : 20, color })], { align })],
      width, { bg, borderColor: opts.border ? 'BFDBFE' : undefined }
    );
  }

  const overallTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [OW_LBL, OW_VAL, OW_VAL],
    rows: [
      new TableRow({ children: [
        oCell('',         OW_LBL, { bg: LIGHT_BLUE, color: BLUE, bold: true, border: true }),
        oCell('Midterm',  OW_VAL, { bg: LIGHT_BLUE, color: BLUE, bold: true, border: true }),
        oCell('Final',    OW_VAL, { bg: LIGHT_BLUE, color: BLUE, bold: true, border: true }),
      ]}),
      new TableRow({ children: [
        oCell('Total Rating',   OW_LBL, { bold: true, color: MED_TEXT, align: 'left' }),
        oCell(fmtAvg(totMid),   OW_VAL, { bold: true }),
        oCell(fmtAvg(totFin),   OW_VAL, { bold: true }),
      ]}),
      new TableRow({ children: [
        oCell('Grade',          OW_LBL, { bold: true, color: MED_TEXT, align: 'left' }),
        oCell(gMid,             OW_VAL, { bold: true, color: gradeColor(gMid) }),
        oCell(gFin,             OW_VAL, { bold: true, color: gradeColor(gFin) }),
      ]}),
    ],
  });

  // ── Comment block ──────────────────────────────────────────────────────────

  function commentBlock(label, text) {
    return [
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 22, color: BLUE })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
        spacing: { before: 300, after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: text || '(none)', size: 20, color: text ? DARK_TEXT : '9CA3AF', italics: !text })],
        spacing: { before: 80, after: 80 },
      }),
    ];
  }

  // ── Core Functions ─────────────────────────────────────────────────────────

  const coreFns     = evaluation.coreFunctions || {};
  const midFlags    = coreFns.midtermFlags || {};
  const finFlags    = coreFns.finalFlags   || {};
  const anyFlagged  = CORE_FUNCTIONS.some((d) => d.items.some((i) => midFlags[i.id] || finFlags[i.id]));
  const hasCF       = anyFlagged || coreFns.midtermComment || coreFns.finalComment;

  const cfSection = [];

  if (hasCF) {
    cfSection.push(spacer(lib, 200), sectionHeader(lib, 'Core Functions (CAPCSD, 2023)'));

    if (anyFlagged) {
      function cfHCell(text, width) {
        return cell(lib,
          [para(lib, [run(lib, text, { bold: true, size: 18, color: BLUE })], { align: 'center' })],
          width, { bg: LIGHT_BLUE, borderColor: 'BFDBFE' }
        );
      }

      const cfRows = [
        new TableRow({ tableHeader: true, children: [
          cfHCell('Core Function', CF_TEXT),
          cfHCell('Domain',        CF_DOMAIN),
          cfHCell('Midterm',       CF_FLAG),
          cfHCell('Final',         CF_FLAG),
        ]}),
      ];

      for (const domain of CORE_FUNCTIONS) {
        for (const item of domain.items) {
          if (!midFlags[item.id] && !finFlags[item.id]) continue;
          cfRows.push(new TableRow({ children: [
            cell(lib, [para(lib, [run(lib, item.text,     { size: 18, color: MED_TEXT  })])], CF_TEXT,   { vAlign: VerticalAlign.TOP }),
            cell(lib, [para(lib, [run(lib, domain.domain, { size: 18, color: GRAY_TEXT, italics: true })])], CF_DOMAIN, { vAlign: VerticalAlign.TOP }),
            cell(lib, [para(lib, [run(lib, midFlags[item.id] ? '✓' : '', { bold: true, size: 20, color: '92400E' })], { align: 'center' })], CF_FLAG, { bg: midFlags[item.id] ? 'FEF3C7' : WHITE }),
            cell(lib, [para(lib, [run(lib, finFlags[item.id] ? '✓' : '', { bold: true, size: 20, color: '92400E' })], { align: 'center' })], CF_FLAG, { bg: finFlags[item.id] ? 'FEF3C7' : WHITE }),
          ]}));
        }
      }

      cfSection.push(
        spacer(lib, 120),
        new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CF_TEXT, CF_DOMAIN, CF_FLAG, CF_FLAG], rows: cfRows }),
      );
    }

    if (coreFns.midtermComment) cfSection.push(...commentBlock('Midterm Core Function Notes', coreFns.midtermComment));
    if (coreFns.finalComment)   cfSection.push(...commentBlock('Final Core Function Notes',   coreFns.finalComment));
  }

  // ── Footer ─────────────────────────────────────────────────────────────────

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `${branding.universityName} — ${branding.departmentName}  ·  Page `, size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '9CA3AF' }),
        new TextRun({ text: ' of ', size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '9CA3AF' }),
      ],
    })],
  });

  // ── Assemble ───────────────────────────────────────────────────────────────

  const children = [
    ...headerBlock,
    infoTable,
    infoRule,
    legend,

    sectionHeader(lib, 'Clinical Skills'),
    spacer(lib, 60),
    buildCompetencyTable(lib, CLINICAL_SKILLS, evaluation.clinicalSkillRatings),

    spacer(lib, 200),
    sectionHeader(lib, 'Clinical Foundations'),
    spacer(lib, 60),
    buildCompetencyTable(lib, CLINICAL_FOUNDATIONS, evaluation.clinicalFoundationRatings),

    spacer(lib, 200),
    sectionHeader(lib, 'Overall'),
    spacer(lib, 60),
    overallTable,

    ...commentBlock('Midterm Comments', evaluation.midtermComments),
    ...commentBlock('Final Comments',   evaluation.finalComments),

    ...cfSection,
  ];

  const doc = new Document({
    creator: 'EIU Clinical Hub',
    title:   `${clinician.name} — Evaluation — ${semName}`,
    sections: [{
      properties: {
        page: {
          size:   { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      footers: { default: footer },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${clinician.name.replace(/\s+/g, '_')}_${(semName || 'eval').replace(/\s+/g, '_')}_Evaluation.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
