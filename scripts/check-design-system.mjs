import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const errors = [];
const scanned = [];

const scanRoots = ["packages/site/src", "packages/admin/src", "packages/web/src"];
for (const dir of scanRoots) {
  if (!existsSync(join(root, dir))) continue;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist"].includes(entry.name)) walk(full);
      } else if (/\.(css|html)$/.test(entry.name)) {
        scanned.push(full);
      }
    }
  };
  walk(join(root, dir));
}
for (const file of ["packages/site/index.html", "packages/site/deck/index.html"]) {
  if (existsSync(join(root, file))) scanned.push(join(root, file));
}

const tokensPath = join(root, "packages/design/tokens.css");
const tokens = readFileSync(tokensPath, "utf8");
const required = [
  "--font-sans",
  "--font-ui",
  "--font-technical",
  "--color-snow",
  "--color-surface",
  "--color-ink",
  "--color-muted",
  "--color-line",
  "--color-glacier",
  "--color-pine",
  "--color-amber",
  "--color-red",
  "--theme-light-bg",
  "--theme-dark-bg",
  "--theme-forest-bg",
  "--theme-midnight-bg",
  "--space-4",
  "--radius-lg",
  "--dur-med",
];
for (const token of required) {
  if (!tokens.includes(`${token}:`)) errors.push(`tokens.css is missing ${token}`);
}

const banned = /Archivo|IBM Plex|font-stretch|font-mono/;
for (const file of scanned) {
  const rel = relative(root, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const where = `${rel}:${index + 1}`;
    if (banned.test(line)) errors.push(`${where}: banned font reference`);
    if (/font-family\s*:/.test(line) && !/font-family\s*:\s*var\(/.test(line)) {
      errors.push(`${where}: font-family must use a --font-* token`);
    }
    const hex = line.match(/#[0-9a-fA-F]{3,8}\b/);
    if (hex) {
      const isThemeColorMeta = /<meta\s+name="theme-color"/.test(line) && hex[0] === "#f7f9fb";
      if (!isThemeColorMeta) {
        errors.push(`${where}: hardcoded colour ${hex[0]}`);
      }
    }
  });
}

const entryImports = {
  "packages/site/src/site.css": "@ch/design/index.css",
  "packages/site/src/deck.css": "@ch/design/index.css",
  "packages/admin/src/main.tsx": "@ch/design/index.css",
  "packages/web/src/main.tsx": "@ch/design/index.css",
};
for (const [file, needle] of Object.entries(entryImports)) {
  if (!readFileSync(join(root, file), "utf8").includes(needle)) {
    errors.push(`${file}: missing ${needle}`);
  }
}

for (const pkg of ["packages/site/package.json", "packages/admin/package.json", "packages/web/package.json"]) {
  const json = JSON.parse(readFileSync(join(root, pkg), "utf8"));
  const deps = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) };
  if (!deps["@ch/design"]) errors.push(`${pkg}: missing @ch/design dependency`);
  for (const legacy of ["@fontsource-variable/archivo", "@fontsource/ibm-plex-mono"]) {
    if (deps[legacy]) errors.push(`${pkg}: remove legacy font dependency ${legacy}`);
  }
}

if (existsSync(join(root, "packages/site/demo"))) {
  errors.push("packages/site/demo still exists; demo pages must stay deleted");
}

if (errors.length) {
  console.error("design:check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`design:check passed (${scanned.length} files, ${required.length} required tokens).`);
