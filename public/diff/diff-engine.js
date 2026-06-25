/**
 * diff-engine.js — Pure diff computation logic
 *
 * Produces a structured DiffResult from two strings using the `diff` library.
 * Features:
 *   - Hunk-based output with proper original/modified line numbers
 *   - Collapse detection for consecutive unchanged lines
 *   - Word-level inline highlighting for replaced lines
 *   - Whitespace-ignore option
 *   - Diff statistics
 *
 * Data flow:
 *   strings → structuredPatch() → hunk lines → parseHunkRows() → DiffHunk[]
 */

import { structuredPatch, diffWords } from "diff";

/* ── Public API ──────────────────────────────────────────────────── */

/**
 * Compute a structured diff between two texts.
 *
 * @param {string} original  — original text
 * @param {string} modified  — modified text
 * @param {object} [opts]    — options
 * @param {boolean} [opts.ignoreWhitespace=false]  — skip whitespace changes
 * @param {number}  [opts.contextLines=4]          — context lines around each hunk
 * @returns {DiffResult}
 */
export function computeDiff(original, modified, opts = {}) {
  const { ignoreWhitespace = false, contextLines = 4 } = opts;

  const patch = structuredPatch(
    "original", "modified",
    original, modified,
    "", "",
    { context: contextLines, ignoreWhitespace }
  );

  if (!patch || !patch.hunks.length) {
    return emptyResult();
  }

  const hunks = patch.hunks.map((hunk) => {
    const rows = parseHunkRows(hunk);
    let added = 0, removed = 0, unchanged = 0;
    for (const r of rows) {
      if (r.type === "added") added++;
      else if (r.type === "removed") removed++;
      else if (r.type === "replaced") { added++; removed++; }
      else unchanged++;
    }
    return {
      originalStart: hunk.oldStart,
      originalCount: hunk.oldLines,
      modifiedStart: hunk.newStart,
      modifiedCount: hunk.newLines,
      header: formatHunkHeader(hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines),
      rows,
      added,
      removed,
      unchanged,
      collapsed: false,   // UI state — toggled by user
    };
  });

  // Mark collapsed blocks: 3+ consecutive unchanged rows
  for (const hunk of hunks) {
    markCollapsed(hunk, 3);
  }

  return {
    totalAdded: hunks.reduce((s, h) => s + h.added, 0),
    totalRemoved: hunks.reduce((s, h) => s + h.removed, 0),
    totalUnchanged: hunks.reduce((s, h) => s + h.unchanged, 0),
    hunkCount: hunks.length,
    hunks,
  };
}

/* ── Hunk-row parsing ────────────────────────────────────────────── */

/**
 * Parse the lines array from a structuredPatch hunk into DiffRow[].
 *
 * The lines array entries look like " context", "-deleted", "+added".
 * Adjacent -/+ pairs are fused into a single "replaced" row with
 * word-level highlighting.
 */
function parseHunkRows(hunk) {
  const lines = hunk.lines;   // string[]  e.g. " foo", "-bar", "+baz"
  const rows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === " ") {
      rows.push(makeRow("unchanged", { originalText: content, modifiedText: content }));
      continue;
    }

    if (prefix === "-") {
      // Peek ahead — if next line is "+", this is a replacement (modification)
      if (i + 1 < lines.length && lines[i + 1][0] === "+") {
        const nextLine = lines[i + 1];
        const nextContent = nextLine.slice(1);
        const wordChanges = diffWords(content, nextContent);
        rows.push(makeRow("replaced", {
          originalText: content,
          modifiedText: nextContent,
          originalHighlighted: renderWordDiffHtml(wordChanges, "removed"),
          modifiedHighlighted: renderWordDiffHtml(wordChanges, "added"),
        }));
        i++; // consume the next "+" line
      } else {
        rows.push(makeRow("removed", { originalText: content }));
      }
      continue;
    }

    if (prefix === "+") {
      rows.push(makeRow("added", { modifiedText: content }));
    }
  }

  // Assign line numbers
  let origLine = hunk.oldStart;
  let modLine = hunk.newStart;
  for (const row of rows) {
    switch (row.type) {
      case "unchanged":
        row.originalLineNum = origLine++;
        row.modifiedLineNum = modLine++;
        break;
      case "removed":
        row.originalLineNum = origLine++;
        row.modifiedLineNum = null;
        break;
      case "added":
        row.originalLineNum = null;
        row.modifiedLineNum = modLine++;
        break;
      case "replaced":
        row.originalLineNum = origLine++;
        row.modifiedLineNum = modLine++;
        break;
    }
  }

  return rows;
}

/* ── Collapse detection ──────────────────────────────────────────── */

function markCollapsed(hunk, threshold) {
  const { rows } = hunk;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type !== "unchanged") continue;
    // Count consecutive unchanged rows
    let j = i;
    while (j < rows.length && rows[j].type === "unchanged") j++;
    const count = j - i;
    if (count >= threshold) {
      // Keep first and last, collapse the middle
      for (let k = i + 1; k < j - 1; k++) {
        rows[k].collapsed = true;
      }
      rows[i].collapseCount = count;
      rows[i].isCollapseStart = true;
      rows[j - 1].isCollapseEnd = true;
    }
    i = j; // skip past the block
  }
}

/* ── Word-level highlight rendering ──────────────────────────────── */

/**
 * Build HTML string for word-level diff.
 * @param {object[]} changes — result of diffWords()
 * @param {"added"|"removed"} mode
 * @returns {string} — safe HTML (caller must not re-escape)
 */
function renderWordDiffHtml(changes, mode) {
  let html = "";
  for (const part of changes) {
    if (part.added) {
      if (mode === "added") {
        html += `<ins class="wdiff-ins">${esc(part.value)}</ins>`;
      }
    } else if (part.removed) {
      if (mode === "removed") {
        html += `<del class="wdiff-del">${esc(part.value)}</del>`;
      }
    } else {
      html += esc(part.value);
    }
  }
  return html;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeRow(type, data) {
  return {
    type,
    originalLineNum: null,
    modifiedLineNum: null,
    collapsed: false,
    isCollapseStart: false,
    isCollapseEnd: false,
    collapseCount: 0,
    originalText: data.originalText || null,
    modifiedText: data.modifiedText || null,
    originalHighlighted: data.originalHighlighted || null,
    modifiedHighlighted: data.modifiedHighlighted || null,
  };
}

function emptyResult() {
  return { totalAdded: 0, totalRemoved: 0, totalUnchanged: 0, hunkCount: 0, hunks: [] };
}

function formatHunkHeader(oldStart, oldLines, newStart, newLines) {
  // Unified-diff quirk: zero-length hunks subtract 1 from start
  const o = oldLines === 0 ? oldStart - 1 : oldStart;
  const n = newLines === 0 ? newStart - 1 : newStart;
  return `@@ -${o},${oldLines} +${n},${newLines} @@`;
}

function esc(s) {
  if (typeof s !== "string") return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
