// Word-level diff utility for SOAP note track changes.
// No external dependencies.

// Compute a word-level diff between two strings.
// Returns array of ops: {type:'equal'|'delete'|'insert'|'replace', text?, deleted?, inserted?, id?}
// Non-equal ops have a numeric `id` for accept/reject tracking.
export function computeDiff(original, edited) {
  if (original === edited) return [{type: 'equal', text: original}];
  if (!original && !edited) return [];
  if (!original) return [{type: 'insert', text: edited, id: 0}];
  if (!edited)   return [{type: 'delete', text: original, id: 0}];

  const a = tokenize(original);
  const b = tokenize(edited);
  const raw = lcsBacktrack(a, b);
  return mergeOps(raw);
}

// Render diff as read-only HTML (for supervisor's saved view)
export function renderDiffHtml(ops) {
  return ops.map((op) => {
    if (op.type === 'equal')   return esc(op.text);
    if (op.type === 'insert')  return `<ins class="diff-ins">${esc(op.text)}</ins>`;
    if (op.type === 'delete')  return `<del class="diff-del">${esc(op.text)}</del>`;
    if (op.type === 'replace') return `<del class="diff-del">${esc(op.deleted)}</del><ins class="diff-ins">${esc(op.inserted)}</ins>`;
    return '';
  }).join('');
}

// Render diff with Accept/Reject buttons for the student.
// acceptedHunks: { [id]: 'accept' | 'reject' }
export function renderDiffInteractive(ops, acceptedHunks = {}) {
  return ops.map((op) => {
    if (op.type === 'equal') return `<span class="diff-equal">${esc(op.text)}</span>`;

    const state = acceptedHunks[op.id]; // 'accept' | 'reject' | undefined
    const stateClass = state === 'accept' ? 'hunk-accepted'
                     : state === 'reject' ? 'hunk-rejected'
                     : 'hunk-pending';

    const btns = `<span class="diff-btns">` +
      `<button class="diff-btn diff-accept-btn ${state === 'accept' ? 'btn-active' : ''}" data-id="${op.id}" data-action="accept" title="Accept change">✓</button>` +
      `<button class="diff-btn diff-reject-btn ${state === 'reject' ? 'btn-active' : ''}" data-id="${op.id}" data-action="reject" title="Reject change">✗</button>` +
      `</span>`;

    if (op.type === 'insert') {
      return `<ins class="diff-ins diff-hunk ${stateClass}" data-id="${op.id}">${esc(op.text)}${btns}</ins>`;
    }
    if (op.type === 'delete') {
      return `<del class="diff-del diff-hunk ${stateClass}" data-id="${op.id}">${esc(op.text)}${btns}</del>`;
    }
    if (op.type === 'replace') {
      return `<span class="diff-hunk diff-replace ${stateClass}" data-id="${op.id}">` +
        `<del class="diff-del">${esc(op.deleted)}</del>` +
        `<ins class="diff-ins">${esc(op.inserted)}</ins>` +
        `${btns}</span>`;
    }
    return '';
  }).join('');
}

// Count pending (undecided) change hunks
export function countPendingHunks(ops, acceptedHunks = {}) {
  return ops.filter((op) => op.type !== 'equal' && acceptedHunks[op.id] === undefined).length;
}

// Apply accepted/rejected decisions to get the final resolved text
export function applyAccepted(ops, acceptedHunks = {}) {
  return ops.map((op) => {
    if (op.type === 'equal') return op.text;
    const state = acceptedHunks[op.id];
    if (op.type === 'insert')  return state === 'accept' ? op.text    : '';
    if (op.type === 'delete')  return state === 'accept' ? ''         : op.text;
    if (op.type === 'replace') return state === 'accept' ? op.inserted : op.deleted;
    return '';
  }).join('');
}

// --- Internals ---

function tokenize(text) {
  // Split into words and whitespace/punctuation tokens
  return text.match(/\S+|\s+/g) || [];
}

function lcsBacktrack(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({type: 'equal', text: a[i - 1]});
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({type: 'insert', text: b[j - 1]});
      j--;
    } else {
      ops.push({type: 'delete', text: a[i - 1]});
      i--;
    }
  }
  return ops.reverse();
}

function mergeOps(ops) {
  // Merge consecutive same-type tokens into single ops
  const merged = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text = (last.text || '') + op.text;
    } else {
      merged.push({...op});
    }
  }

  // Pair adjacent delete+insert as 'replace'; assign IDs to non-equal ops
  let id = 0;
  const result = [];
  let k = 0;
  while (k < merged.length) {
    const op = merged[k];
    if (op.type === 'delete' && k + 1 < merged.length && merged[k + 1].type === 'insert') {
      result.push({type: 'replace', deleted: op.text, inserted: merged[k + 1].text, id: id++});
      k += 2;
    } else if (op.type !== 'equal') {
      result.push({...op, id: id++});
      k++;
    } else {
      result.push(op);
      k++;
    }
  }
  return result;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}
