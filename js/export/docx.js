// Word (.docx) export using the docx library loaded from CDN

let docxLib = null;

async function loadDocx() {
  if (docxLib) return docxLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';
    script.onload = () => { docxLib = window.docx; resolve(docxLib); };
    script.onerror = () => reject(new Error('Failed to load docx library'));
    document.head.appendChild(script);
  });
}

// Parse Quill HTML into an array of docx Paragraph objects
function htmlToParagraphs(lib, html) {
  if (!html) return [new lib.Paragraph({ text: '' })];

  const div = document.createElement('div');
  div.innerHTML = html;

  const paragraphs = [];

  function nodeToRuns(node) {
    const runs = [];
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) runs.push({ text });
      return runs;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return runs;

    const tag = node.tagName.toLowerCase();

    // Line break
    if (tag === 'br') {
      runs.push({ text: '', break: true });
      return runs;
    }

    // Recurse into children and collect runs
    const childRuns = [];
    for (const child of node.childNodes) {
      childRuns.push(...nodeToRuns(child));
    }

    // Apply formatting based on tag
    const isBold      = ['strong', 'b'].includes(tag);
    const isItalic    = ['em', 'i'].includes(tag);
    const isUnderline = tag === 'u';

    // Quill highlight: <span style="background-color: ...">
    let highlight = null;
    if (tag === 'span') {
      const style = node.getAttribute('style') || '';
      if (style.includes('background-color')) {
        // Map common Quill highlight colors to Word highlight names
        const colorMap = {
          'rgb(255, 255, 0)': 'yellow',
          'rgb(0, 255, 0)': 'green',
          'rgb(0, 255, 255)': 'cyan',
          'rgb(255, 0, 255)': 'magenta',
          'rgb(255, 0, 0)': 'red',
          'rgb(0, 0, 255)': 'blue',
          'rgb(255, 165, 0)': 'darkYellow',
        };
        for (const [rgb, name] of Object.entries(colorMap)) {
          if (style.includes(rgb)) { highlight = name; break; }
        }
        if (!highlight) highlight = 'yellow'; // fallback for any bg color
      }
    }

    if (isBold || isItalic || isUnderline || highlight) {
      return childRuns.map((r) => ({
        ...r,
        bold:      r.bold      || isBold,
        italics:   r.italics   || isItalic,
        underline: r.underline || (isUnderline ? {} : undefined),
        highlight: r.highlight || highlight,
      }));
    }

    return childRuns;
  }

  function processNode(node) {
    const tag = node.tagName ? node.tagName.toLowerCase() : null;

    if (tag === 'p') {
      const runs = [];
      for (const child of node.childNodes) {
        runs.push(...nodeToRuns(child));
      }
      if (runs.length === 0) {
        paragraphs.push(new lib.Paragraph({ text: '' }));
      } else {
        paragraphs.push(new lib.Paragraph({
          children: runs.map((r) => {
            if (r.break) return new lib.TextRun({ text: '', break: 1 });
            return new lib.TextRun({
              text:      r.text || '',
              bold:      r.bold      || false,
              italics:   r.italics   || false,
              underline: r.underline || undefined,
              highlight: r.highlight || undefined,
            });
          }),
          spacing: { after: 80 },
        }));
      }
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of node.querySelectorAll('li')) {
        const runs = [];
        for (const child of li.childNodes) {
          runs.push(...nodeToRuns(child));
        }
        paragraphs.push(new lib.Paragraph({
          children: [
            new lib.TextRun({ text: '• ' }),
            ...runs.map((r) => new lib.TextRun({
              text:      r.text || '',
              bold:      r.bold      || false,
              italics:   r.italics   || false,
              underline: r.underline || undefined,
            })),
          ],
          spacing: { after: 40 },
        }));
      }
    } else {
      // Fallback: recurse
      for (const child of node.childNodes) {
        processNode(child);
      }
    }
  }

  for (const child of div.childNodes) {
    processNode(child);
  }

  return paragraphs.length > 0 ? paragraphs : [new lib.Paragraph({ text: '' })];
}

function makeHeading(lib, text, level = 1) {
  const sizes = { 1: 36, 2: 28, 3: 24 };
  return new lib.Paragraph({
    children: [new lib.TextRun({ text, bold: true, size: sizes[level] || 24 })],
    spacing: { before: level === 1 ? 0 : 200, after: 100 },
  });
}

function makeLabelValue(lib, label, value) {
  return new lib.Paragraph({
    children: [
      new lib.TextRun({ text: label + ': ', bold: true, size: 20 }),
      new lib.TextRun({ text: value || '—', size: 20 }),
    ],
    spacing: { after: 60 },
  });
}

function makeDivider(lib) {
  return new lib.Paragraph({
    border: { bottom: { style: lib.BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
    spacing: { before: 160, after: 160 },
    text: '',
  });
}

export async function exportClinicianDocx(clinician, observations, settings) {
  const lib = await loadDocx();
  const { Document, Packer, Paragraph, TextRun, BorderStyle, AlignmentType } = lib;

  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date));

  const presentObs = sorted.filter((o) => !o.absent);
  const absentObs  = sorted.filter((o) => o.absent);
  const totalObserved = presentObs.reduce((sum, o) => sum + (o.minutesObserved || 0), 0);
  const totalSession  = presentObs.reduce((sum, o) => sum + (o.totalMinutes || 0), 0);
  const overallPct    = totalSession > 0 ? Math.round((totalObserved / totalSession) * 100) : 0;

  const children = [];

  // === Document Header ===
  children.push(makeHeading(lib, 'Clinical Observation Notes', 1));
  children.push(makeLabelValue(lib, 'Clinician', clinician.name));
  children.push(makeLabelValue(lib, 'Client', clinician.clientInitials));
  children.push(makeLabelValue(lib, 'Supervisor', settings?.supervisor || ''));
  children.push(makeLabelValue(lib, 'Semester', settings?.name || ''));
  children.push(makeLabelValue(lib, 'Session Days', clinician.sessionDays));
  children.push(makeLabelValue(lib, 'Session Time', clinician.sessionTime));

  // === Summary Stats ===
  children.push(makeDivider(lib));
  children.push(makeHeading(lib, 'Semester Summary', 2));
  children.push(makeLabelValue(lib, 'Total Sessions Logged', String(sorted.length)));
  children.push(makeLabelValue(lib, 'Absences', String(absentObs.length)));
  children.push(makeLabelValue(lib, 'Minutes Observed', String(totalObserved)));
  children.push(makeLabelValue(lib, 'Total Session Minutes', String(totalSession)));
  children.push(makeLabelValue(lib, 'Overall Observation %', overallPct + '%'));

  // === Observations ===
  children.push(makeDivider(lib));
  children.push(makeHeading(lib, 'Session Notes', 2));

  sorted.forEach((obs, i) => {
    const isAbsent  = !!obs.absent;
    const typeLabel = obs.sessionType === 'eval' ? 'Evaluation' : 'Treatment (Tx)';
    const pct       = obs.totalMinutes > 0
      ? Math.round((obs.minutesObserved / obs.totalMinutes) * 100)
      : 0;

    // Session header line
    const dateFormatted = obs.date; // YYYY-MM-DD; basic format
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `Session ${i + 1} — ${dateFormatted}`, bold: true, size: 22 }),
        new TextRun({ text: `  ${typeLabel}`, size: 20, color: '555555' }),
        ...(isAbsent
          ? [new TextRun({ text: '  [CLIENT ABSENT]', bold: true, color: 'CC0000', size: 20 })]
          : [new TextRun({ text: `  ${obs.minutesObserved}/${obs.totalMinutes} min (${pct}%)`, size: 20, color: '555555' })]),
      ],
      spacing: { before: 200, after: 80 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' },
      },
    }));

    // Notes
    if (!isAbsent && obs.notes) {
      children.push(...htmlToParagraphs(lib, obs.notes));
    } else if (isAbsent) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Client absent — no observation recorded.', italics: true, color: '888888', size: 20 })],
        spacing: { after: 80 },
      }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: '(No notes recorded)', italics: true, color: '888888', size: 20 })],
        spacing: { after: 80 },
      }));
    }

    // Competency tags
    if ((obs.competencyTags || []).length > 0) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Competencies: ', bold: true, size: 18, color: '444444' }),
          new TextRun({ text: obs.competencyTags.join(', '), size: 18, color: '444444' }),
        ],
        spacing: { before: 60, after: 120 },
      }));
    }
  });

  if (sorted.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'No observations logged yet.', italics: true, color: '888888' })],
    }));
  }

  // Build document
  const doc = new Document({
    creator: 'EIU Clinical Observation Notes',
    title: `${clinician.name} — Observation Notes`,
    sections: [{
      properties: {
        page: {
          margin: { top: 900, bottom: 900, left: 1080, right: 1080 },
        },
      },
      children,
    }],
  });

  // Generate and download
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const semName = settings?.name || 'export';
  a.download = `${clinician.name.replace(/\s+/g, '_')}_${semName}_Observations.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
