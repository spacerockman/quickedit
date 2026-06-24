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
import { marked } from "marked";

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
const TEMP_FILENAME = "temp.txt";
let currentFilename = null;
let fileHandle = null;
let tempDirHandle = null;
let fileInTempDir = false;
let isDirty = false;
let previewMode = "off"; // "off" | "split" | "full"

// ---- IndexedDB for handle persistence ----
const IDB_NAME = "quickedit-fs";
const IDB_STORE = "handles";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Temp directory & file management ----
async function verifyPermission(handle) {
  if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") return true;
  return false;
}

async function ensureTempDir() {
  let dirHandle = await idbGet("temp-dir");
  if (dirHandle) {
    if (await verifyPermission(dirHandle)) {
      tempDirHandle = dirHandle;
      return dirHandle;
    }
    await idbDel("temp-dir");
  }
  if (!window.showDirectoryPicker) {
    alert("This browser does not support directory access (File System Access API).\nPlease use Chrome or Edge to enable temp file saving in Downloads/tmp/.");
    return null;
  }
  alert("Select your Downloads folder to create the tmp/ subfolder for temp files.");
  try {
    const picked = await window.showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
    dirHandle = await picked.getDirectoryHandle("tmp", { create: true });
    await idbSet("temp-dir", dirHandle);
    tempDirHandle = dirHandle;
    return dirHandle;
  } catch (e) {
    if (e.name !== "AbortError") console.error("Directory picker failed:", e);
    return null;
  }
}

async function initTempFile() {
  let dirHandle = await idbGet("temp-dir");
  if (!dirHandle || !(await verifyPermission(dirHandle))) {
    currentFilename = TEMP_FILENAME;
    fileInTempDir = false;
    updateTitle();
    return;
  }
  tempDirHandle = dirHandle;
  try {
    const fh = await dirHandle.getFileHandle(TEMP_FILENAME, { create: true });
    fileHandle = fh;
    fileInTempDir = true;
    currentFilename = TEMP_FILENAME;
    const file = await fh.getFile();
    const text = await file.text();
    loadFileContent(text, TEMP_FILENAME);
    setDirty(false);
  } catch (e) {
    console.error("Temp file init failed:", e);
    currentFilename = TEMP_FILENAME;
    fileInTempDir = false;
    updateTitle();
  }
}

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
  const name = currentFilename || TEMP_FILENAME;
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
    keymap.of([
      indentWithTab,
      { key: "Mod-w", run: () => { closeFile(false); return true; } },
    ]),
    langCompartment.of(plainText()),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setDirty(true);
        scheduleAutoSave();
        if (previewMode !== "off") updatePreview();
      }
      if (update.selectionSet || update.docChanged || update.focusChanged) {
        updateCursorPos();
      }
      updateStats();
    }),
  ],
  parent: document.getElementById("editor"),
});

// ---- Auto-save (localStorage + file, debounced 2s) ----
let autoSaveTimer = 0;
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const content = view.state.doc.toString();
    localStorage.setItem("quickedit-content", content);
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (e) {
        console.error("Auto-save to file failed:", e);
      }
    }
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

async function openFileWithPicker() {
  if (!window.showOpenFilePicker) {
    document.getElementById("file-input").click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker();
    fileHandle = handle;
    fileInTempDir = false;
    const file = await handle.getFile();
    const text = await file.text();
    loadFileContent(text, file.name);
    setDirty(false);
    localStorage.setItem("quickedit-is-temp", "false");
    localStorage.setItem("quickedit-last-filename", file.name);
  } catch (e) {
    if (e.name !== "AbortError") console.error("Open failed:", e);
  }
}

async function saveFile() {
  const content = view.state.doc.toString();

  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setDirty(false);
      return;
    } catch (e) {
      console.error("Save to file handle failed:", e);
      fileHandle = null;
    }
  }

  const dir = await ensureTempDir();
  if (dir) {
    try {
      const name = currentFilename || TEMP_FILENAME;
      const fh = await dir.getFileHandle(name, { create: true });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      fileHandle = fh;
      fileInTempDir = true;
      currentFilename = name;
      setLanguage(name);
      updateTitle();
      setDirty(false);
      localStorage.setItem("quickedit-is-temp", "true");
      const hintEl = document.getElementById("status-hint");
      if (hintEl) hintEl.textContent = "Saved to Downloads/tmp/" + name;
      return;
    } catch (e) {
      console.error("Save to temp dir failed:", e);
      alert("Failed to save to Downloads/tmp/: " + e.message);
    }
  }

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: currentFilename || TEMP_FILENAME,
      });
      fileHandle = handle;
      fileInTempDir = false;
      currentFilename = handle.name;
      updateTitle();
      setLanguage(handle.name);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      setDirty(false);
      localStorage.setItem("quickedit-is-temp", "false");
      localStorage.setItem("quickedit-last-filename", handle.name);
      return;
    } catch (e) {
      if (e.name !== "AbortError") console.error("Save picker failed:", e);
      return;
    }
  }

  const name = currentFilename || TEMP_FILENAME;
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

function readAndOpen(file) {
  const reader = new FileReader();
  reader.onload = () => {
    fileHandle = null;
    fileInTempDir = false;
    loadFileContent(reader.result, file.name);
    setDirty(false);
    localStorage.setItem("quickedit-is-temp", "false");
    localStorage.setItem("quickedit-last-filename", file.name);
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

// ---- Rename file ----
async function renameFile(newName) {
  newName = newName.trim();
  if (!newName || newName === currentFilename) return;

  const content = view.state.doc.toString();

  if (fileInTempDir && tempDirHandle) {
    try {
      const newHandle = await tempDirHandle.getFileHandle(newName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
      if (fileHandle && fileHandle.name !== newName) {
        await tempDirHandle.removeEntry(fileHandle.name);
      }
      fileHandle = newHandle;
      currentFilename = newName;
      setLanguage(newName);
      updateTitle();
      setDirty(false);
      return;
    } catch (e) {
      console.error("Rename in temp dir failed:", e);
    }
  }

  currentFilename = newName;
  setLanguage(newName);
  updateTitle();
  fileHandle = null;
  fileInTempDir = false;
}
window.renameFile = renameFile;

// ---- Close file ----
async function closeFile(discard = true) {
  if (isDirty) {
    if (discard) {
      if (!confirm("Discard unsaved changes?")) return;
    } else {
      await saveFile();
      if (isDirty) return;
    }
  }

  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
  localStorage.setItem("quickedit-content", "");
  localStorage.setItem("quickedit-is-temp", "true");
  localStorage.removeItem("quickedit-last-filename");

  let dirHandle = await idbGet("temp-dir");
  if (dirHandle && await verifyPermission(dirHandle)) {
    tempDirHandle = dirHandle;
    try {
      const fh = await dirHandle.getFileHandle(TEMP_FILENAME, { create: true });
      const writable = await fh.createWritable();
      await writable.write("");
      await writable.close();
      fileHandle = fh;
      fileInTempDir = true;
    } catch (e) {
      console.error("Create new temp file failed:", e);
      fileHandle = null;
      fileInTempDir = false;
    }
  } else {
    fileHandle = null;
    fileInTempDir = false;
  }

  currentFilename = TEMP_FILENAME;
  setLanguage(TEMP_FILENAME);
  setDirty(false);
  updateStats();
  updateCursorPos();
  updateTitle();
}
window.closeFile = () => closeFile(true);

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

// ---- Rename via double-click on filename ----
const filenameEl = document.getElementById("filename");
filenameEl.style.cursor = "pointer";
filenameEl.title = "Double-click to rename";

filenameEl.addEventListener("dblclick", () => {
  const oldName = currentFilename || TEMP_FILENAME;
  const input = document.createElement("input");
  input.type = "text";
  input.value = oldName;
  input.id = "filename-edit";
  input.size = Math.max(oldName.length + 2, 12);
  filenameEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  async function commit() {
    if (committed) return;
    committed = true;
    const newName = input.value.trim() || oldName;
    input.replaceWith(filenameEl);
    if (newName !== oldName) {
      await renameFile(newName);
    } else {
      updateTitle();
    }
  }

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    else if (e.key === "Escape") {
      committed = true;
      input.value = oldName;
      input.replaceWith(filenameEl);
      updateTitle();
    }
  });
});

// ---- Markdown preview ----
const editorEl = document.getElementById("editor");
const previewEl = document.getElementById("preview");

function updatePreview() {
  if (previewMode === "off" || !previewEl) return;
  const text = view.state.doc.toString();
  const ext = currentFilename ? currentFilename.split(".").pop().toLowerCase() : "";
  if (ext === "md" || ext === "markdown") {
    previewEl.innerHTML = marked.parse(text);
  } else {
    previewEl.innerHTML = "<pre class='no-md-hint'>Preview is only available for Markdown (.md) files</pre>";
  }
}

function applyPreviewMode() {
  if (!previewEl) return;
  const content = document.getElementById("content");
  content.classList.remove("preview-split", "preview-full");
  const btn = document.getElementById("btn-preview");
  if (previewMode === "off") {
    if (btn) btn.textContent = "Preview";
  } else if (previewMode === "split") {
    content.classList.add("preview-split");
    if (btn) btn.textContent = "Split";
    updatePreview();
  } else if (previewMode === "full") {
    content.classList.add("preview-full");
    if (btn) btn.textContent = "Editor";
    updatePreview();
  }
}

window.togglePreview = function () {
  if (previewMode === "off") previewMode = "split";
  else if (previewMode === "split") previewMode = "full";
  else previewMode = "off";
  applyPreviewMode();
};

// ---- Keyboard shortcuts (case-insensitive, capture phase) ----
window.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === "s") { e.preventDefault(); e.stopPropagation(); }
  else if (key === "o") { e.preventDefault(); e.stopPropagation(); openFileWithPicker(); }
  else if (key === "w") { e.preventDefault(); e.stopPropagation(); closeFile(false); }
  else if (key === "p" && e.shiftKey) { e.preventDefault(); e.stopPropagation(); window.togglePreview(); }
  else if (key === "b") { e.preventDefault(); e.stopPropagation(); window.toggleTheme(); }
}, true);

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

const isTempSession = localStorage.getItem("quickedit-is-temp") !== "false";
if (isTempSession) {
  if (!window.showDirectoryPicker) {
    const hintEl = document.getElementById("status-hint");
    if (hintEl) hintEl.textContent = "Note: use Chrome for temp file saving in Downloads/tmp/";
  }
  initTempFile();
} else {
  const lastFile = localStorage.getItem("quickedit-last-filename");
  if (lastFile) {
    currentFilename = lastFile;
    setLanguage(lastFile);
    updateTitle();
  }
}
