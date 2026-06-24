import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["public/editor.js"],
  bundle: true,
  format: "iife",
  outfile: "public/editor.bundle.js",
  target: ["es2020"],
  minify: true,
});

console.log("✅ editor.bundle.js built");
