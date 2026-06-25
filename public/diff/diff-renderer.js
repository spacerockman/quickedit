/**
 * diff-renderer.js — DOM rendering for diff results
 *
 * Takes a DiffResult (from diff-engine.js) and renders DOM trees
 * for both unified and side-by-side views.
 *
 * Functions are pure — they build DOM fragments and return them.
 * The caller (diff-view.js) attaches them to the document.
 */

/* ── Unified view ────────────────────────────────────────────────── */

/**
 * Render a DiffResult into a unified-view DOM fragment.
 * Each hunk is rendered as: header → rows … header → rows …
 * Consecutive unchanged blocks >= 3 lines are collapsible.
 *
 * @param {import("./diff-engine.js").DiffResult} diffResult
 * @returns {DocumentFragment}
 */
export function renderUnified(diffResult) {
  const frag = document.createDocumentFragment();

  for (const hunk of diffResult.hunks) {
    // Hunk header
    const headerEl = hunkHeaderEl(hunk);
    frag.appendChild(headerEl);

    // Rows
    for (const row of hunk.rows) {
      if (row.collapsed) continue;

      if (row.isCollapseStart && row.collapseCount >= 3) {
        // Collapse toggle marker
        frag.appendChild(hunkCollapseToggleEl(row.collapseCount));
      }

      switch (row.type) {
        case "unchanged":
          frag.appendChild(unifiedRowEl(row, "unchanged"));
          break;
        case "removed":
          frag.appendChild(unifiedRowEl(row, "removed"));
          break;
        case "added":
          frag.appendChild(unifiedRowEl(row, "added"));
          break;
        case "replaced":
          // Show old line (removed) then new line (added)
          frag.appendChild(unifiedRowEl(row, "removed", row.originalHighlighted || row.originalText));
          frag.appendChild(unifiedRowEl(row, "added", row.modifiedHighlighted || row.modifiedText, row.modifiedLineNum));
          break;
      }
    }
  }

  return frag;
}

/* ── Side-by-side view ───────────────────────────────────────────── */

/**
 * Render a DiffResult into a side-by-side two-column DOM fragment.
 *
 * Each row is a <div> with two child cells.
 *   - Unchanged: both cells filled
 *   - Removed: left filled, right empty
 *   - Added: left empty, right filled
 *   - Replaced: left (original + word-del), right (modified + word-ins)
 *
 * @param {import("./diff-engine.js").DiffResult} diffResult
 * @returns {DocumentFragment}
 */
export function renderSideBySide(diffResult) {
  const frag = document.createDocumentFragment();

  for (const hunk of diffResult.hunks) {
    // Hunk header spanning both columns
    const headerEl = hunkHeaderEl(hunk);
    frag.appendChild(headerEl);

    for (const row of hunk.rows) {
      if (row.collapsed) continue;

      if (row.isCollapseStart && row.collapseCount >= 3) {
        frag.appendChild(sbsCollapseToggleEl(row.collapseCount));
      }

      const line = document.createElement("div");
      line.className = "sbs-row";

      // Left cell (original)
      const left = document.createElement("div");
      left.className = "sbs-cell sbs-left";

      // Right cell (modified)
      const right = document.createElement("div");
      right.className = "sbs-cell sbs-right";

      switch (row.type) {
        case "unchanged": {
          left.className += " sbs-unchanged";
          right.className += " sbs-unchanged";
          left.appendChild(lineNumSpan(row.originalLineNum));
          left.appendChild(contentSpan(row.originalText));
          right.appendChild(lineNumSpan(row.modifiedLineNum));
          right.appendChild(contentSpan(row.modifiedText));
          break;
        }
        case "removed": {
          left.className += " sbs-removed";
          right.className += " sbs-empty";
          left.appendChild(lineNumSpan(row.originalLineNum));
          left.appendChild(contentSpan(row.originalText));
          break;
        }
        case "added": {
          left.className += " sbs-empty";
          right.className += " sbs-added";
          right.appendChild(lineNumSpan(row.modifiedLineNum));
          right.appendChild(contentSpan(row.modifiedText));
          break;
        }
        case "replaced": {
          left.className += " sbs-removed";
          right.className += " sbs-added";
          left.appendChild(lineNumSpan(row.originalLineNum));
          appendWordDiff(left, row.originalHighlighted || row.originalText);
          right.appendChild(lineNumSpan(row.modifiedLineNum));
          appendWordDiff(right, row.modifiedHighlighted || row.modifiedText);
          break;
        }
      }

      line.appendChild(left);
      line.appendChild(right);
      frag.appendChild(line);
    }
  }

  return frag;
}

/* ── Statistics bar ──────────────────────────────────────────────── */

/**
 * Build a statistics bar element.
 * @param {import("./diff-engine.js").DiffResult} dr
 * @returns {HTMLElement}
 */
export function statsBar(dr) {
  const el = document.createElement("div");
  el.className = "diff-stats";

  const total = dr.totalAdded + dr.totalRemoved + dr.totalUnchanged;

  const added = span("diff-stat-added", `+${dr.totalAdded}`);
  const removed = span("diff-stat-removed", `-${dr.totalRemoved}`);
  const unchanged = span("diff-stat-unchanged", `${dr.totalUnchanged} unchanged`);
  const hunkInfo = span("diff-stat-hunks", `${dr.hunkCount} hunks`);

  el.appendChild(added);
  if (dr.totalRemoved > 0 || dr.totalAdded > 0) {
    const arrow = document.createTextNode("  ");
    el.appendChild(arrow);
    el.appendChild(removed);
  }
  el.appendChild(document.createTextNode("  "));
  el.appendChild(unchanged);
  el.appendChild(document.createTextNode("  ·  "));
  el.appendChild(hunkInfo);

  return el;
}

/* ── Hunk header ─────────────────────────────────────────────────── */

function hunkHeaderEl(hunk) {
  const el = document.createElement("div");
  el.className = "diff-hunk-header";
  el.textContent = hunk.header;
  return el;
}

/* ── Unified row ─────────────────────────────────────────────────── */

function unifiedRowEl(row, typeClass, contentOverride, lineNumOverride) {
  const el = document.createElement("div");
  el.className = `diff-line diff-${typeClass}`;

  // Line number
  const num = document.createElement("span");
  num.className = "diff-num";
  // In unified mode, show both original and modified line numbers
  const onum = lineNumOverride != null ? lineNumOverride : row.originalLineNum;
  const mnum = row.modifiedLineNum;
  if (typeClass === "removed" && onum != null) {
    num.textContent = String(onum);
  } else if (typeClass === "added" && mnum != null) {
    num.textContent = String(mnum);
  } else if (typeClass === "unchanged" && mnum != null) {
    num.textContent = String(mnum);
  } else {
    num.textContent = "";
  }
  el.appendChild(num);

  // Prefix (+ / - / space)
  const prefix = document.createElement("span");
  prefix.className = "diff-prefix";
  if (typeClass === "added") prefix.textContent = "+";
  else if (typeClass === "removed") prefix.textContent = "-";
  else prefix.textContent = " ";
  el.appendChild(prefix);

  // Code content (may contain word-level ins/del HTML)
  const code = document.createElement("span");
  code.className = "diff-code";
  const content = contentOverride != null ? contentOverride : row.originalText;
  if (contentOverride && contentOverride.includes("<")) {
    // Content has HTML tags from word-diff — use innerHTML (content is pre-escaped)
    code.innerHTML = contentOverride;
  } else {
    code.textContent = content || "";
  }
  el.appendChild(code);

  return el;
}

/* ── Line number span ────────────────────────────────────────────── */

function lineNumSpan(num) {
  const s = document.createElement("span");
  s.className = "sbs-line-num";
  s.textContent = num != null ? String(num) : "";
  return s;
}

/* ── Content span ────────────────────────────────────────────────── */

function contentSpan(text) {
  const s = document.createElement("span");
  s.className = "sbs-code";
  s.textContent = text || "";
  return s;
}

/* ── Collapse toggle markers ─────────────────────────────────────── */

function hunkCollapseToggleEl(count) {
  const el = document.createElement("div");
  el.className = "diff-collapse";
  el.textContent = `▸ ${count} unchanged lines ▸`;
  el.addEventListener("click", () => {
    // Dispatch a custom event so diff-view can handle expansion
    el.dispatchEvent(new CustomEvent("expand-collapse", { bubbles: true, detail: { action: "expand" } }));
  });
  el.title = "Click to expand";
  return el;
}

function sbsCollapseToggleEl(count) {
  const el = document.createElement("div");
  el.className = "diff-collapse sbs-collapse";
  el.textContent = `▸ ${count} unchanged lines ▸`;
  el.addEventListener("click", () => {
    el.dispatchEvent(new CustomEvent("expand-collapse", { bubbles: true, detail: { action: "expand" } }));
  });
  el.title = "Click to expand";
  return el;
}

/* ── Shared helpers ──────────────────────────────────────────────── */

function span(cls, text) {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

/**
 * Safely append word-diff HTML content to a DOM element.
 * Parses <ins>/<del> tags from renderWordDiffHtml into real DOM nodes.
 */
function appendWordDiff(el, content) {
  if (!content) return;
  if (content.includes("<")) {
    const temp = document.createElement("div");
    temp.innerHTML = content;
    while (temp.firstChild) el.appendChild(temp.firstChild);
  } else {
    el.appendChild(document.createTextNode(content));
  }
}
