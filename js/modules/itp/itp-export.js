// ITP Word export — generates a .docx matching the EIU CDS ITP template format.
// Uses the docx library loaded from CDN (same pattern as export/docx.js).

let docxLib = null;

async function loadDocx() {
  if (docxLib) return docxLib;
  return new Promise((resolve, reject) => {
    const script    = document.createElement('script');
    script.src      = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';
    script.onload   = () => { docxLib = window.docx; resolve(docxLib); };
    script.onerror  = () => reject(new Error('Failed to load docx library.'));
    document.head.appendChild(script);
  });
}

export async function exportItpDocx(itp, clinician, settings) {
  const lib = await loadDocx();
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    Table, TableRow, TableCell, WidthType, AlignmentType,
    BorderStyle, ShadingType, convertInchesToTwip,
  } = lib;

  const h = itp.header || {};

  // ── Helper builders ────────────────────────────────────────────────────────

  function heading(text, level = 1) {
    return new Paragraph({
      text,
      heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
    });
  }

  function para(text, opts = {}) {
    return new Paragraph({
      children: [new TextRun({ text: text || '', ...opts })],
      spacing: { after: 80 },
    });
  }

  function boldPara(text) {
    return new Paragraph({
      children: [new TextRun({ text: text || '', bold: true })],
      spacing: { after: 80 },
    });
  }

  function cell(text, opts = {}) {
    return new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: text || '', ...opts })] })],
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      ...(opts.shading ? { shading: { type: ShadingType.CLEAR, fill: opts.shading } } : {}),
    });
  }

  function labelValueRow(label, value) {
    return new TableRow({
      children: [
        cell(label, { bold: true, shading: 'E8F0FE' }),
        cell(value),
      ],
    });
  }

  function twoColTable(rows) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left:   { style: BorderStyle.SINGLE, size: 1 },
        right:  { style: BorderStyle.SINGLE, size: 1 },
        insideH:{ style: BorderStyle.SINGLE, size: 1 },
        insideV:{ style: BorderStyle.SINGLE, size: 1 },
      },
      rows,
    });
  }

  // ── Document content ───────────────────────────────────────────────────────

  const children = [];

  // --- Letterhead ---
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Eastern Illinois University', bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Department of Communication Disorders and Sciences', size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'INITIAL TREATMENT PLAN', bold: true, size: 26 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 240 },
    }),
  );

  // --- Header table ---
  children.push(
    twoColTable([
      labelValueRow('Clinician',          h.clinicianName  || ''),
      labelValueRow('Client',             h.clientDisplay  || ''),
      labelValueRow('Supervisor',         h.supervisorName || ''),
      labelValueRow('Semester',           h.semester       || ''),
      labelValueRow('Diagnosis',          h.diagnosis      || ''),
      labelValueRow('Type of Service',    h.serviceType    || ''),
    ]),
    new Paragraph({ text: '', spacing: { after: 240 } }),
  );

  // --- Functional Outcome Goals ---
  children.push(heading('Functional Outcome Goals and Semester Objectives'));

  if (!itp.functionalOutcomeGoals || itp.functionalOutcomeGoals.length === 0) {
    children.push(para('No goals recorded.'));
  } else {
    for (let fi = 0; fi < itp.functionalOutcomeGoals.length; fi++) {
      const fog = itp.functionalOutcomeGoals[fi];
      children.push(heading(`Functional Outcome Goal ${fi + 1}`, 2));
      children.push(para(fog.goal || '(Goal not entered)'));

      // Objectives table
      if (fog.objectives && fog.objectives.length > 0) {
        const objRows = [
          new TableRow({
            tableHeader: true,
            children: [
              cell('Semester Objective', { bold: true, shading: 'C5D8F6' }),
              cell('Target Accuracy',    { bold: true, shading: 'C5D8F6' }),
              cell('Cueing Level',       { bold: true, shading: 'C5D8F6' }),
            ],
          }),
          ...fog.objectives.map((obj, oi) => new TableRow({
            children: [
              cell(`${oi + 1}. ${obj.text || ''}`),
              cell(obj.accuracy || ''),
              cell(obj.cueing   || ''),
            ],
          })),
        ];
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top:     { style: BorderStyle.SINGLE, size: 1 },
              bottom:  { style: BorderStyle.SINGLE, size: 1 },
              left:    { style: BorderStyle.SINGLE, size: 1 },
              right:   { style: BorderStyle.SINGLE, size: 1 },
              insideH: { style: BorderStyle.SINGLE, size: 1 },
              insideV: { style: BorderStyle.SINGLE, size: 1 },
            },
            rows: objRows,
          }),
          new Paragraph({ text: '', spacing: { after: 200 } }),
        );
      }
    }
  }

  // --- EBP section ---
  children.push(heading('Evidence-Based Practice'));

  const articles = itp.ebpArticles || [];
  if (articles.length === 0) {
    children.push(para('No EBP articles recorded.'));
  } else {
    for (let ai = 0; ai < articles.length; ai++) {
      const a = articles[ai];
      children.push(boldPara(`Article ${ai + 1}`));
      children.push(boldPara('Citation:'));
      children.push(para(a.citation || ''));
      children.push(boldPara('Clinical Summary:'));
      children.push(para(a.summary  || ''));
      if (a.keyFindings && a.keyFindings.length > 0) {
        children.push(boldPara('Key Findings:'));
        for (const kf of a.keyFindings) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `• ${kf}` })],
            spacing:  { after: 40 },
          }));
        }
      }
      children.push(boldPara('Treatment Rationale:'));
      children.push(para(a.rationale || ''));
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    }
  }

  // --- Signatures ---
  children.push(
    new Paragraph({ text: '', spacing: { after: 480 } }),
    twoColTable([
      new TableRow({
        children: [
          cell('Clinician Signature / Date', { bold: true }),
          cell('Supervisor Signature / Date', { bold: true }),
        ],
      }),
      new TableRow({
        children: [
          cell(''),
          cell(''),
        ],
        height: { value: convertInchesToTwip ? convertInchesToTwip(0.6) : 864 },
      }),
    ]),
  );

  // ── Pack and download ──────────────────────────────────────────────────────

  const doc  = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${(clinician.name || 'ITP').replace(/\s+/g, '_')}_ITP_${itp.semesterId || 'draft'}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
