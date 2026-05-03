import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

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

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: true,
    minify: "esbuild",
    outDir: "dist",
  },
  plugins: [copyRootStaticFiles()],
});
