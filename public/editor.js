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

// ---- Theme ----
const THEME_KEY = "quickedit-theme";

function isDark() {
  return (localStorage.getItem(THEME_KEY) || "dark") === "dark";
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

let currentFilename = null;

// ---- Editor ----
const savedContent = localStorage.getItem("quickedit-content") || "";

const view = new EditorView({
  doc: savedContent,
  extensions: [
    basicSetup,
    keymap.of([indentWithTab]),
    langCompartment.of(plainText()),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) scheduleAutoSave();
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
  document.getElementById("filename").textContent = filename || "Untitled";
  localStorage.setItem("quickedit-content", content);
}

function readAndOpen(file) {
  const reader = new FileReader();
  reader.onload = () => loadFileContent(reader.result, file.name);
  reader.readAsText(file);
}

window.handleDrop = function (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  const file = e.dataTransfer.files?.[0];
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

window.openFileDialog = function () {
  document.getElementById("file-input").click();
};

window.saveFile = function () {
  const content = view.state.doc.toString();
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
};

// ---- Status bar ----
function updateStats() {
  const doc = view.state.doc;
  const text = doc.toString();
  document.getElementById("line-count").textContent = doc.lines;
  document.getElementById("word-count").textContent = text.trim()
    ? text.trim().split(/\s+/).length
    : 0;
}

// ---- Keyboard shortcuts ----
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "s") { e.preventDefault(); window.saveFile(); }
  if (mod && e.key === "o") { e.preventDefault(); window.openFileDialog(); }
  if (mod && e.key === "b") { e.preventDefault(); window.toggleTheme(); }
});

// ---- Init ----
applyTheme(isDark());
setLanguage(null);
updateStats();
