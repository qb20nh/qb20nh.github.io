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
const criticalHeaderCss = `:root{color-scheme:light;--bg:#fff;--text:#111;--muted:#666;--line:#ddd;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#111;--text:#eee;--muted:#aaa;--line:#333}}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text)}.shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0 36px}.topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding-bottom:20px;border-bottom:1px solid var(--line)}.brand{display:grid;gap:8px}.eyebrow{margin:0;color:var(--muted);font-size:13px;font-weight:600;text-transform:uppercase}h1{max-width:780px;margin:0;font-size:32px;line-height:1.15}@media (max-width:760px){.shell{width:min(100% - 24px,1180px);padding-top:20px}.topbar{display:grid;align-items:start}h1{font-size:28px}}`;

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
        const criticalCss = criticalHeaderCss.replace(/<\/style/gi, "<\\/style");
        const fullStyle = `\n    <style>${css}</style>`;
        html = html.replace(linkPattern, `\n    <style>${criticalCss}</style>`);
        html = html.replace("</header>", `</header>${fullStyle}`);
        await rm(cssPath, { force: true });
      }

      html = moveInitialModuleScriptToBodyEnd(html);
      await writeFile(htmlPath, html);
    },
  };
}

function moveInitialModuleScriptToBodyEnd(html) {
  const scriptPattern = /\n\s*<script\s+type="module"\s+crossorigin\s+src="\/assets\/index-[^"]+\.js"><\/script>/;
  const match = html.match(scriptPattern);
  if (!match) return html;

  return html
    .replace(match[0], "")
    .replace("\n  </body>", `${match[0]}\n  </body>`);
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
