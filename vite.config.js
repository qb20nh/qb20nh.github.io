import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import { renderProjectCards } from "./src/app/project-template.js";

const rootStaticFiles = ["projects.json", "16k.mp3", "keyboard.svg", "favicon.ico", "CNAME"];

function copyRootStaticFiles() {
  return {
    name: "copy-root-static-files",
    apply: "build",
    async closeBundle() {
      await Promise.all(
        rootStaticFiles.map(async (file) => {
          const target = resolve("dist", file);
          await mkdir(dirname(target), { recursive: true });
          if (file.endsWith(".json")) {
            const json = JSON.parse(await readFile(resolve(file), "utf8"));
            await writeFile(target, JSON.stringify(json));
            return;
          }

          await copyFile(resolve(file), target);
        }),
      );
    },
  };
}

function prerenderDirectory() {
  return {
    name: "prerender-directory",
    async transformIndexHtml(html) {
      const projects = JSON.parse(await readFile(resolve("projects.json"), "utf8"));
      const cards = renderProjectCards(projects).trim();

      return html.replace(
        '<section class="directory grid" id="directory" aria-label="Project directory"></section>',
        `<section class="directory grid" id="directory" aria-label="Project directory">\n${cards}\n      </section>`,
      );
    },
  };
}

function inlineCssBundle() {
  return {
    name: "inline-css-bundle",
    apply: "build",
    async closeBundle() {
      const htmlPath = resolve("dist", "index.html");
      const assetsPath = resolve("dist", "assets");
      const assetFiles = await readdir(assetsPath).catch(() => []);

      let html = await readFile(htmlPath, "utf8");
      for (const fileName of assetFiles) {
        if (!fileName.endsWith(".css")) continue;

        const href = `/assets/${fileName}`;
        const cssPath = resolve(assetsPath, fileName);
        const css = (await readFile(cssPath, "utf8")).replace(
          /<\/style/gi,
          "<\\/style",
        );
        const linkPattern = new RegExp(
          `\\n?\\s*<link\\s+[^>]*href="${escapeRegExp(href)}"[^>]*>`,
        );
        html = html.replace(linkPattern, `\n    <style>${css}</style>`);
        await rm(cssPath, { force: true });
      }

      await writeFile(htmlPath, html);
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: true,
    minify: "esbuild",
    outDir: "dist",
  },
  plugins: [prerenderDirectory(), inlineCssBundle(), copyRootStaticFiles()],
});
