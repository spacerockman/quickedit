/**
 * diff-view.js — Diff modal component
 *
 * Manages the diff modal lifecycle, state, and event wiring.
 * Uses diff-engine.js for computation and diff-renderer.js for DOM rendering.
 *
 * Exports a single class: DiffView
 *
 * Usage:
 *   import { DiffView } from "./diff/diff-view.js";
 *   const dv = new DiffView(editorView);
 *   dv.open();  // snapshot editor content and show modal
 */

import { computeDiff } from "./diff-engine.js";
import { renderUnified, renderSideBySide, statsBar } from "./diff-renderer.js";

/**
 * @typedef {"unified"|"sidebyside"} ViewMode
 * @typedef {"idle"|"computing"|"done"} DiffState
 */

const VIEW_MODE_KEY = "quickedit-diff-view-mode";

export class DiffView {
  /** @type {import("@codemirror/view").EditorView} */
  #editor;

  /** @type {DiffState} */
  #state = "idle";

  /** @type {ViewMode} */
  #viewMode = "unified";

  /** @type {import("./diff-engine.js").DiffResult|null} */
  #result = null;

  /** @type {number|null} */
  #debounceTimer = null;

  /** @type {string|null} */
  #latestOriginal = null;

  /** @type {string|null} */
  #latestModified = null;

  /** @type {boolean} */
  #ignoreWhitespace = false;

  /** @type {Element[]} */
  #changeAnchors = [];

  /** @type {number} */
  #currentChangeIndex = -1;

  // DOM refs (populated in init)
  /** @type {HTMLElement} */
  modal;
  /** @type {HTMLTextAreaElement} */
  originalTextarea;
  /** @type {HTMLTextAreaElement} */
  modifiedTextarea;
  /** @type {HTMLElement} */
  outputEl;
  /** @type {HTMLElement} */
  statsEl;
  /** @type {HTMLElement} */
  headerEl;
  /** @type {HTMLElement[]} */
  focusableElements = [];

  /* ── Constructor ──────────────────────────────────────────────── */

  /**
   * @param {import("@codemirror/view").EditorView} editorView
   */
  constructor(editorView) {
    this.#editor = editorView;
    this.#viewMode = localStorage.getItem(VIEW_MODE_KEY) === "sidebyside"
      ? "sidebyside"
      : "unified";
  }

  /* ── Init (called once after editor.js mounts) ─────────────────── */

  init() {
    this.modal = document.getElementById("diff-modal");
    this.originalTextarea = document.getElementById("diff-original");
    this.modifiedTextarea = document.getElementById("diff-modified");
    this.outputEl = document.getElementById("diff-output");
    this.statsEl = document.getElementById("diff-stats");
    this.headerEl = document.getElementById("diff-view-mode");

    if (!this.modal || !this.originalTextarea || !this.modifiedTextarea || !this.outputEl) {
      console.warn("DiffView: missing modal DOM elements — aborting init");
      return;
    }

    // Wire event listeners
    this.#wireEvents();

    // Restore view mode
    this.#updateViewModeUI();
  }

  /* ── Open ──────────────────────────────────────────────────────── */

  /**
   * Snapshot editor content and open the diff modal.
   * Optionally copy the modified textarea with clipboard content.
   */
  open() {
    const editorContent = this.#editor.state.doc.toString();
    this.#latestOriginal = editorContent;
    this.originalTextarea.value = editorContent;
    this.modifiedTextarea.value = "";
    this.outputEl.innerHTML = "";
    this.statsEl.innerHTML = "";
    this.#result = null;
    this.#changeAnchors = [];
    this.#currentChangeIndex = -1;
    this.#state = "idle";

    // Try clipboard — offer to auto-paste
    this.#tryClipboard();

    this.modal.classList.add("open");
    this.modifiedTextarea.focus();
    this.#updateFocusableElements();
  }

  /* ── Close ─────────────────────────────────────────────────────── */

  close() {
    this.modal.classList.remove("open");
    this.#cancelDebounce();
    this.#state = "idle";
  }

  /* ── Compute diff ──────────────────────────────────────────────── */

  compute() {
    const original = this.originalTextarea.value;
    const modified = this.modifiedTextarea.value;

    if (this.#latestOriginal === original && this.#latestModified === modified && this.#result) {
      return; // No change — skip recompute
    }

    this.#latestOriginal = original;
    this.#latestModified = modified;
    this.#state = "computing";

    // Show subtle loading indicator
    this.outputEl.innerHTML = `<div class="diff-computing">Computing diff…</div>`;

    // Use requestAnimationFrame + setTimeout to let the browser paint the loading indicator
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const result = computeDiff(original, modified, {
            ignoreWhitespace: this.#ignoreWhitespace,
            contextLines: 4,
          });
          this.#result = result;
          this.#state = "done";
          this.#render();
        } catch (err) {
          this.#state = "idle";
          this.outputEl.innerHTML = `<div class="diff-error">Error computing diff: ${err.message}</div>`;
        }
      }, 16);
    });
  }

  /* ── Toggle view mode ──────────────────────────────────────────── */

  toggleViewMode() {
    this.#viewMode = this.#viewMode === "unified" ? "sidebyside" : "unified";
    localStorage.setItem(VIEW_MODE_KEY, this.#viewMode);
    this.#updateViewModeUI();
    if (this.#result && this.#state === "done") {
      this.#render();
    }
  }

  /* ── Toggle ignore whitespace ──────────────────────────────────── */

  toggleIgnoreWhitespace(checked) {
    this.#ignoreWhitespace = checked;
    if (this.#latestModified && this.#latestModified !== "") {
      this.compute();
    }
  }

  /* ── Copy as unified diff ──────────────────────────────────────── */

  copyAsUnifiedPatch() {
    if (!this.#result) return;
    const original = this.originalTextarea.value;
    const modified = this.modifiedTextarea.value;

    // Use the diff library's createTwoFilesPatch for a proper unified diff
    // Since we already import diff in engine, we'll build a patch string manually
    let patch = `--- Original\n+++ Modified\n`;
    for (const hunk of this.#result.hunks) {
      patch += hunk.header + "\n";
      for (const row of hunk.rows) {
        if (row.collapsed && !row.isCollapseStart) continue;
        if (row.isCollapseStart && row.collapseCount >= 3) {
          patch += `@@ ${row.collapseCount} unchanged @@\n`;
          continue;
        }
        switch (row.type) {
          case "unchanged":
            patch += " " + row.originalText + "\n";
            break;
          case "removed":
            patch += "-" + row.originalText + "\n";
            break;
          case "added":
            patch += "+" + row.modifiedText + "\n";
            break;
          case "replaced":
            patch += "-" + row.originalText + "\n";
            patch += "+" + row.modifiedText + "\n";
            break;
        }
      }
    }

    navigator.clipboard.writeText(patch).catch(() => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = patch;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }

  /* ── Navigation ────────────────────────────────────────────────── */

  nextChange() {
    if (!this.#changeAnchors.length) return;
    const next = (this.#currentChangeIndex + 1) % this.#changeAnchors.length;
    this.#scrollToChange(next);
  }

  prevChange() {
    if (!this.#changeAnchors.length) return;
    const prev = (this.#currentChangeIndex - 1 + this.#changeAnchors.length) % this.#changeAnchors.length;
    this.#scrollToChange(prev);
  }

  #scrollToChange(index) {
    const anchor = this.#changeAnchors[index];
    if (!anchor) return;
    this.#currentChangeIndex = index;
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    this.#updateNavUI();
  }

  /* ── Private: wire events ────────────────────────────────────── */

  #wireEvents() {
    // Close button / overlay
    const closeBtn = document.getElementById("btn-diff-close");
    const overlay = document.getElementById("diff-overlay");
    closeBtn?.addEventListener("click", () => this.close());
    overlay?.addEventListener("click", () => this.close());

    // Compute button
    const compareBtn = document.getElementById("btn-diff-compare");
    compareBtn?.addEventListener("click", () => this.compute());

    // Debounced auto-compute on modified textarea input
    this.modifiedTextarea?.addEventListener("input", () => {
      this.#scheduleCompute();
    });

    // Also auto-compute on original changes (shouldn't happen normally since it's readonly,
    // but just in case someone types in it)
    this.originalTextarea?.addEventListener("input", () => {
      this.#scheduleCompute();
    });

    // View mode toggle
    const viewModeBtn = document.getElementById("btn-diff-mode");
    viewModeBtn?.addEventListener("click", () => this.toggleViewMode());

    // Ignore whitespace toggle
    const wsCheckbox = document.getElementById("diff-ignore-ws");
    wsCheckbox?.addEventListener("change", (e) => {
      this.toggleIgnoreWhitespace(e.target.checked);
    });

    // Copy button
    const copyBtn = document.getElementById("btn-diff-copy");
    copyBtn?.addEventListener("click", () => this.copyAsUnifiedPatch());

    // Navigation
    const nextBtn = document.getElementById("btn-diff-next");
    const prevBtn = document.getElementById("btn-diff-prev");
    nextBtn?.addEventListener("click", () => this.nextChange());
    prevBtn?.addEventListener("click", () => this.prevChange());

    // Escape key — close modal (capture phase)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modal?.classList.contains("open")) {
        this.close();
      }
    });

    // Focus trap
    this.modal?.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      this.#handleFocusTrap(e);
    });

    // Expand/collapse events from collapse toggles (bubbled up)
    this.outputEl?.addEventListener("expand-collapse", () => {
      // Re-render without collapse — expansion requires fully expanding the block
      // For simplicity, we re-render with context=99 (essentially no collapse)
      if (this.#latestOriginal != null && this.#latestModified != null) {
        const result = computeDiff(this.#latestOriginal, this.#latestModified, {
          ignoreWhitespace: this.#ignoreWhitespace,
          contextLines: 99,  // Expand everything
        });
        this.#result = result;
        this.#render();
      }
    });
  }

  /* ── Private: scheduled auto-compute ──────────────────────────── */

  #scheduleCompute() {
    this.#cancelDebounce();
    this.#debounceTimer = setTimeout(() => {
      this.compute();
    }, 300);
  }

  #cancelDebounce() {
    if (this.#debounceTimer != null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }

  /* ── Private: render ─────────────────────────────────────────── */

  #render() {
    const result = this.#result;
    if (!result || !result.hunks.length) {
      this.outputEl.innerHTML = `<div class="diff-empty">No changes — the texts are identical.</div>`;
      this.statsEl.innerHTML = "";
      this.#updateNavUI();
      return;
    }

    // Build stat bar
    this.statsEl.innerHTML = "";
    this.statsEl.appendChild(statsBar(result));

    // Render diff output
    const frag = this.#viewMode === "unified"
      ? renderUnified(result)
      : renderSideBySide(result);

    // Clear and append
    this.outputEl.innerHTML = "";
    this.outputEl.appendChild(frag);

    // Collect change anchors for navigation
    this.#collectChangeAnchors();

    // Apply view mode class
    this.outputEl.classList.toggle("diff-unified", this.#viewMode === "unified");
    this.outputEl.classList.toggle("diff-sbs", this.#viewMode === "sidebyside");

    // Show completion feedback
    this.#showToast(`Found ${result.totalAdded} additions, ${result.totalRemoved} deletions across ${result.hunkCount} hunks`);
  }

  /* ── Private: navigation anchors ───────────────────────────────── */

  #collectChangeAnchors() {
    this.#changeAnchors = [];
    // Find all hunk headers and changed lines
    const els = this.outputEl.querySelectorAll(
      ".diff-hunk-header, .diff-removed, .diff-added, .sbs-removed, .sbs-added"
    );
    for (const el of els) {
      this.#changeAnchors.push(el);
    }
    this.#currentChangeIndex = this.#changeAnchors.length > 0 ? 0 : -1;
    this.#updateNavUI();
  }

  #updateNavUI() {
    const nextBtn = document.getElementById("btn-diff-next");
    const prevBtn = document.getElementById("btn-diff-prev");
    const hasChanges = this.#changeAnchors.length > 0;

    if (nextBtn) nextBtn.disabled = !hasChanges;
    if (prevBtn) prevBtn.disabled = !hasChanges;

    // Show current position
    const navLabel = document.getElementById("diff-nav-pos");
    if (navLabel) {
      navLabel.textContent = hasChanges
        ? `${this.#currentChangeIndex + 1} / ${this.#changeAnchors.length}`
        : "";
    }
  }

  /* ── Private: focus trap ─────────────────────────────────────── */

  #updateFocusableElements() {
    this.focusableElements = Array.from(
      this.modal?.querySelectorAll(
        'button, textarea, input, [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  #handleFocusTrap(e) {
    const els = this.focusableElements;
    if (els.length < 2) return;

    const first = els[0];
    const last = els[els.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /* ── Private: view mode UI ───────────────────────────────────── */

  #updateViewModeUI() {
    const btn = document.getElementById("btn-diff-mode");
    if (btn) {
      if (this.#viewMode === "sidebyside") {
        btn.textContent = "Unified";
        btn.title = "Switch to unified view";
      } else {
        btn.textContent = "Side-by-side";
        btn.title = "Switch to side-by-side view";
      }
    }
  }

  /* ── Private: clipboard helper ───────────────────────────────── */

  async #tryClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.length > 0 && text.length < 100000) {
        this.modifiedTextarea.value = text;
        this.#scheduleCompute();
      }
    } catch {
      // Clipboard read not available (e.g. no permission or not HTTPS)
    }
  }

  /* ── Private: toast ──────────────────────────────────────────── */

  #toastTimer = null;
  #showToast(msg) {
    // Simple ephemeral feedback on the stats bar
    const toast = document.getElementById("diff-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("diff-toast-visible");
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => {
      toast.classList.remove("diff-toast-visible");
    }, 3000);
  }
}
