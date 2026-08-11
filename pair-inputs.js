// pair-inputs.js — duplique les images FR de input/ vers leurs slugs EN
//
// articles.json liste les articles par paires : une entrée FR, puis sa version EN.
// Ce script parcourt cette liste ; dès qu'un slug n'a pas d'image dans input/,
// il copie celle du dernier slug qui en avait une (= sa version FR).
//
// Usage:
//   node pair-inputs.js            -> copie ce qui manque
//   node pair-inputs.js --dry      -> montre ce qui serait fait, ne touche à rien
//   node pair-inputs.js --force    -> écrase les images déjà présentes
//   node pair-inputs.js --link     -> crée un lien physique au lieu d'une copie (0 octet en plus)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = (...a) => path.join(__dirname, ...a);

const args = process.argv.slice(2);
const DRY = args.includes("--dry") || args.includes("--dry-run");
const FORCE = args.includes("--force");
const LINK = args.includes("--link");

const IMG_EXTS = ["png", "jpg", "jpeg", "webp"];

function findInput(slug) {
  for (const ext of IMG_EXTS) {
    const f = p("input", `${slug}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function place(src, dest) {
  if (DRY) return;
  if (fs.existsSync(dest)) fs.rmSync(dest);
  if (LINK) {
    try {
      fs.linkSync(src, dest);
      return;
    } catch {
      // lien physique impossible (volumes différents, FS récalcitrant) → copie
    }
  }
  fs.copyFileSync(src, dest);
}

const articles = JSON.parse(fs.readFileSync(p("articles.json"), "utf8"));

let source = null;   // dernière image trouvée = la version FR de la paire courante
let copied = 0, skipped = 0, orphans = [];

for (const { slug } of articles) {
  const existing = findInput(slug);

  if (existing && !FORCE) {
    source = existing;
    continue;
  }

  if (!source) {
    orphans.push(slug);
    continue;
  }

  // même extension que la source, sinon build.js ne la retrouve pas
  const dest = p("input", slug + path.extname(source));

  if (existing && FORCE) {
    // déjà là mais on écrase : on garde quand même l'existant comme source
    // uniquement s'il vient d'être posé à la main pour cette langue.
    console.log(`  ~ ${path.basename(dest)}  (écrasé depuis ${path.basename(source)})`);
  } else {
    console.log(`  ${LINK ? "⇢" : "+"} ${path.basename(dest)}  ← ${path.basename(source)}`);
  }

  place(source, dest);
  copied++;
}

for (const slug of orphans) {
  console.warn(`  ⚠  ${slug} : aucune image, et aucune source avant lui dans articles.json`);
}

// slugs FR/EN toujours sans image après passage
const missing = articles.map((a) => a.slug).filter((s) => !findInput(s) && !DRY);
skipped = articles.length - copied - missing.length;

console.log(
  `\n${DRY ? "[dry-run] " : ""}${copied} image(s) ${LINK ? "liée(s)" : "copiée(s)"}, ` +
  `${skipped} déjà en place${missing.length ? `, ${missing.length} manquante(s)` : ""}.`
);
if (missing.length) for (const s of missing) console.log(`     manque : ${s}`);
