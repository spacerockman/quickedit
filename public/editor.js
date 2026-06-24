import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";

// ---- Language map (filename ext -> CM6 extension factory) ----
const LANG_FACTORY = {
  js: javascript, mjs: javascript, cjs: javascript,
  ts: javascript, tsx: javascript, jsx: javascript,
  py: python, pyi: python, pyx: python,
  md: markdown, markdown: markdown,
  html: html, htm: html, xml: html, svg: html, xhtml: html,
  css: css, scss: css, less: css,
  json: json, jsonc: json, json5: json,
};

const LANG_LABEL = {
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript", jsx: "JSX",
  py: "Python",
  md: "Markdown",
  html: "HTML", xml: "XML",
  css: "CSS",
  json: "JSON",
};

const plainText = () => [];
const langCompartment = new Compartment();

// ---- State ----
let currentFilename = null;
let fileHandle = null; // FileSystemFileHandle (File System Access API)
let isDirty = false;

// ---- Theme ----
const THEME_KEY = "quickedit-theme";

function isDark() {
  return (localStorage.getItem(THEME_KEY) || "light") === "dark";
}

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.innerHTML = dark ? "&#9788;" : "&#9790;";
}

window.toggleTheme = function () {
  applyTheme(!isDark());
};

// ---- Dirty tracking & title ----
function setDirty(dirty) {
  isDirty = dirty;
  updateTitle();
}

function updateTitle() {
  const name = currentFilename || "Untitled";
  const prefix = isDirty ? "\u2022 " : "";
  document.title = prefix + name + " \u2014 QuickEdit";
  document.getElementById("filename").textContent = prefix + name;
}

// ---- Language selection ----
function langForFile(filename) {
  if (!filename) return plainText();
  const ext = filename.split(".").pop().toLowerCase();
  const factory = LANG_FACTORY[ext];
  return factory ? factory() : plainText();
}

function setLanguage(filename) {
  view.dispatch({ effects: langCompartment.reconfigure(langForFile(filename)) });
  const ext = filename ? filename.split(".").pop().toLowerCase() : "";
  const label = LANG_LABEL[ext] || "Plain Text";
  document.getElementById("lang-label").textContent = label;
}

// ---- Editor ----
const savedContent = localStorage.getItem("quickedit-content") || "";

const view = new EditorView({
  doc: savedContent,
  extensions: [
    basicSetup,
    keymap.of([indentWithTab]),
    langCompartment.of(plainText()),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setDirty(true);
        scheduleAutoSave();
      }
      if (update.selectionSet || update.docChanged || update.focusChanged) {
        updateCursorPos();
      }
      updateStats();
    }),
  ],
  parent: document.getElementById("editor"),
});

// ---- Auto-save (localStorage, debounced 2s) ----
let autoSaveTimer = 0;
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    localStorage.setItem("quickedit-content", view.state.doc.toString());
  }, 2000);
}

// ---- File operations ----
function loadFileContent(content, filename) {
  currentFilename = filename;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
  setLanguage(filename);
  updateTitle();
  localStorage.setItem("quickedit-content", content);
}

// Open via File System Access API (native dialog) — gives us a handle for save-back
async function openFileWithPicker() {
  if (!window.showOpenFilePicker) {
    // Fallback: legacy file input
    document.getElementById("file-input").click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker();
    fileHandle = handle;
    const file = await handle.getFile();
    const text = await file.text();
    loadFileContent(text, file.name);
    setDirty(false);
  } catch (e) {
    if (e.name !== "AbortError") console.error("Open failed:", e);
  }
}

// Save: write back to the opened file handle, or prompt for save location
async function saveFile() {
  const content = view.state.doc.toString();

  // Case 1: we have a file handle — write directly (normal save)
  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setDirty(false);
      return;
    } catch (e) {
      console.error("Save to file handle failed:", e);
      // Permission may have been revoked — fall through to picker
      fileHandle = null;
    }
  }

  // Case 2: no handle — use save picker to choose location
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: currentFilename || "untitled.txt",
      });
      fileHandle = handle;
      currentFilename = handle.name;
      updateTitle();
      setLanguage(handle.name);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      setDirty(false);
      return;
    } catch (e) {
      if (e.name !== "AbortError") console.error("Save picker failed:", e);
      return;
    }
  }

  // Case 3: legacy fallback — download
  const name = currentFilename || "untitled.txt";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setDirty(false);
}

// Open via drag-drop or legacy file input — no file handle available
function readAndOpen(file) {
  const reader = new FileReader();
  reader.onload = () => {
    fileHandle = null;
    loadFileContent(reader.result, file.name);
    setDirty(false);
  };
  reader.readAsText(file);
}

window.handleDrop = function (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  const file = e.dataTransfer?.files?.[0];
  if (file) readAndOpen(file);
};

window.handleDragOver = function (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
};

window.handleFileInput = function (e) {
  const file = e.target.files?.[0];
  if (file) readAndOpen(file);
  e.target.value = "";
};

window.openFileDialog = openFileWithPicker;
window.saveFile = saveFile;

// ---- Drop overlay: toggle dragover class on #app ----
const app = document.getElementById("app");
let dragCounter = 0;

app.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  dragCounter++;
  app.classList.add("dragover");
});

app.addEventListener("dragover", (e) => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

app.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    app.classList.remove("dragover");
  }
});

app.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  app.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file) readAndOpen(file);
});

// ---- Status bar ----
function updateStats() {
  const doc = view.state.doc;
  const text = doc.toString();
  document.getElementById("line-count").textContent = doc.lines;
  document.getElementById("word-count").textContent = text.trim()
    ? text.trim().split(/\s+/).length
    : 0;
}

function updateCursorPos() {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  document.getElementById("cursor-pos").textContent =
    "Ln " + line.number + ", Col " + (pos - line.from() + 1);
}

// ---- Keyboard shortcuts (case-insensitive) ----
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === "s") { e.preventDefault(); } // suppress; save via toolbar button only
  else if (key === "o") { e.preventDefault(); openFileWithPicker(); }
  else if (key === "b") { e.preventDefault(); window.toggleTheme(); }
});

// ---- Warn before closing with unsaved changes ----
window.addEventListener("beforeunload", (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---- Init ----
applyTheme(isDark());
setLanguage(null);
updateStats();
updateCursorPos();
updateTitle();
