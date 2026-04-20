import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsJs = readFileSync(resolve(__dirname, "../../hub/projects.js"), "utf8");

// projects.js assigns to window.HTML_APPS_PROJECTS. Strip the wrapper and eval.
const raw = projectsJs.replace(/^\s*window\.HTML_APPS_PROJECTS\s*=\s*/, "").replace(/;\s*$/, "");
let parsed: any[];
try {
  parsed = eval(raw);
} catch (e) {
  throw new Error(`Failed to parse projects.js: ${(e as Error).message}`);
}

export interface AppTarget {
  name: string;
  slug: string;
  path: string;
  external: boolean;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const APPS: AppTarget[] = parsed.map((p) => {
  const external = /^https?:/.test(p.path);
  return {
    name: p.name,
    slug: slugify(p.name),
    path: p.path,
    external,
  };
});

export const INTERNAL_APPS = APPS.filter((a) => !a.external);
