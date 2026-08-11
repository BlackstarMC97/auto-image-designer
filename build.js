// build.js — MboaGeek OG image generator
// Usage:
//   node build.js               -> build every entry in articles.json
//   node build.js <slug> [slug] -> build only those slugs
//
// Per article it needs: input/<slug>.(png|jpg|jpeg|webp)  +  an entry in articles.json
// Output: output/<slug>.png (dimensions = CONFIG.width x CONFIG.height)

import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = (...a) => path.join(__dirname, ...a);

// ─────────────────────────────────────────────────────────────
// CONFIG — tout se règle ici (positions, tailles, couleurs)
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  width: 1600,
  height: 900,

  colors: {
    overlay: "243,235,224", // #F3EBE0 (rgb, l'alpha vient du champ "overlay" par article)
    text: "#093D67",        // bleu titre / URL
    rule: "9,61,103",       // rgb des filets autour du sous-titre
  },

  defaultOverlay: 0.95, // opacité par défaut si "overlay" absent dans articles.json

  image: {
    // Comment l'image de base occupe le cadre de sortie :
    //   "cover"   : remplit tout, recadrage centré (l'image déborde et est coupée)
    //   "contain" : image entière visible, mise à l'échelle, bandes sur les côtés
    //   "stretch" : étirée pile aux dimensions de sortie, rien coupé mais ratio déformé
    fit: "contain",
    background: "#F3EBE0", // couleur des bandes en mode "contain"
  },

  logo: {
    file: p("assets", "logo.png"),
    x: 96,
    y: 88,
    height: 106, // largeur calculée pour garder le ratio
  },

  title: {
    font: "MulishTitle",
    color: "#093D67",
    uppercase: true,
    maxWidth: 1250,   // largeur max avant retour à la ligne
    maxLines: 3,      // on vise 2, on tolère 3
    startSize: 68,    // taille de départ, réduite jusqu'à ce que ça rentre
    minSize: 34,
    lineHeight: 1.8,
    letterSpacing: 0.8,
    // Mulish ExtraBold est la police la plus grasse fournie : on épaissit les
    // glyphes au trait (faux-bold) pour aller au-delà. 0 = désactivé.
    strokeBoost: 2.2,
    centerY: 424,     // centre vertical du bloc titre
  },

  subtitle: {
    font: "MulishSub", // déjà en italique
    color: "#0F3F63",
    size: 34,
    maxWidth: 1180,
    minSize: 22,
    y: 612,            // ligne de base
    rule: {
      enabled: true,
      gap: 42,         // espace entre le texte et le filet
      innerX: 210,     // le filet gauche part d'ici, le droit s'arrête à width-innerX
      thickness: 3,
      alpha: 0.32,
    },
  },

  url: {
    text: "www.mboageek.com",
    font: "MulishUrl",
    color: "#093D67",
    size: 40,
    rightMargin: 150,
    baselineY: 800,
  },

  output: {
    format: "png", // "png" ou "jpeg"
    jpegQuality: 92,
  },
};

// ─────────────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────────────
GlobalFonts.registerFromPath(p("assets/fonts/Mulish-ExtraBold.woff2"), "MulishTitle");
GlobalFonts.registerFromPath(p("assets/fonts/Mulish-SemiBoldItalic.woff2"), "MulishSub");
GlobalFonts.registerFromPath(p("assets/fonts/Mulish-Bold.woff2"), "MulishUrl");

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const IMG_EXTS = ["png", "jpg", "jpeg", "webp"];

function findInput(slug) {
  for (const ext of IMG_EXTS) {
    const f = p("input", `${slug}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// dessine l'image de base dans le cadre de sortie selon CONFIG.image.fit
function drawBase(ctx, img, W, H, cfg) {
  if (cfg.fit === "stretch") {
    ctx.drawImage(img, 0, 0, W, H);
    return;
  }
  const scale = cfg.fit === "contain"
    ? Math.min(W / img.width, H / img.height)  // image entière, bandes possibles
    : Math.max(W / img.width, H / img.height); // "cover" : remplit, recadre
  const w = img.width * scale;
  const h = img.height * scale;
  if (cfg.fit === "contain") {
    ctx.fillStyle = cfg.background;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// mesure une ligne en tenant compte du letter-spacing
function lineWidth(ctx, text, spacing) {
  let w = ctx.measureText(text).width;
  if (spacing) w += spacing * Math.max(0, text.length - 1);
  return w;
}

// dessine un texte centré avec letter-spacing.
// stroke > 0 : épaissit les glyphes au trait (faux-bold) dans la couleur du fill.
function fillCentered(ctx, text, cx, y, spacing, stroke = 0) {
  const paint = (t, x) => {
    ctx.fillText(t, x, y);
    if (stroke > 0) ctx.strokeText(t, x, y);
  };
  if (!spacing) {
    ctx.textAlign = "center";
    paint(text, cx);
    return;
  }
  const total = lineWidth(ctx, text, spacing);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  for (const ch of text) {
    paint(ch, x);
    x += ctx.measureText(ch).width + spacing;
  }
}

// découpe un texte en lignes pour une largeur donnée
function wrap(ctx, text, maxWidth, spacing) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? cur + " " + word : word;
    if (lineWidth(ctx, test, spacing) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// trouve la plus grande taille de police qui rentre en <= maxLines
function fitTitle(ctx, text, cfg) {
  for (let size = cfg.startSize; size >= cfg.minSize; size -= 1) {
    ctx.font = `${size}px ${cfg.font}`;
    const lines = wrap(ctx, text, cfg.maxWidth, cfg.letterSpacing);
    const fits = lines.length <= cfg.maxLines &&
      lines.every((l) => lineWidth(ctx, l, cfg.letterSpacing) <= cfg.maxWidth);
    if (fits) return { size, lines };
  }
  ctx.font = `${cfg.minSize}px ${cfg.font}`;
  return { size: cfg.minSize, lines: wrap(ctx, text, cfg.maxWidth, cfg.letterSpacing) };
}

function fitSubtitle(ctx, text, cfg) {
  for (let size = cfg.size; size >= cfg.minSize; size -= 1) {
    ctx.font = `${size}px ${cfg.font}`;
    if (ctx.measureText(text).width <= cfg.maxWidth) return size;
  }
  return cfg.minSize;
}

// ─────────────────────────────────────────────────────────────
// Rendu d'un article
// ─────────────────────────────────────────────────────────────
async function render(article) {
  const { slug, title, subtitle } = article;
  const overlayAlpha = article.overlay ?? CONFIG.defaultOverlay;

  const inputPath = findInput(slug);
  if (!inputPath) {
    console.warn(`  ⚠  ${slug} : aucune image trouvée dans input/ (${IMG_EXTS.map(e => slug + "." + e).join(", ")}) — ignoré`);
    return false;
  }

  const W = CONFIG.width, H = CONFIG.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 1. image de base (cover / contain / stretch)
  const base = await loadImage(inputPath);
  drawBase(ctx, base, W, H, CONFIG.image);

  // 2. overlay crème
  ctx.fillStyle = `rgba(${CONFIG.colors.overlay},${overlayAlpha})`;
  ctx.fillRect(0, 0, W, H);

  // 3. logo
  if (fs.existsSync(CONFIG.logo.file)) {
    const logo = await loadImage(CONFIG.logo.file);
    const lw = (logo.width / logo.height) * CONFIG.logo.height;
    ctx.drawImage(logo, CONFIG.logo.x, CONFIG.logo.y, lw, CONFIG.logo.height);
  } else {
    console.warn("  ⚠  assets/logo.png manquant — le logo ne sera pas dessiné");
  }

  ctx.textBaseline = "alphabetic";
  const cx = W / 2;

  // 4. titre (auto-fit, centré)
  const tcfg = CONFIG.title;
  const titleText = tcfg.uppercase ? title.toUpperCase() : title;
  const { size, lines } = fitTitle(ctx, titleText, tcfg);
  ctx.font = `${size}px ${tcfg.font}`;
  ctx.fillStyle = tcfg.color;
  const boost = tcfg.strokeBoost ?? 0;
  if (boost > 0) {
    ctx.strokeStyle = tcfg.color;
    ctx.lineWidth = boost;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }
  const lh = size * tcfg.lineHeight;
  // hauteur visuelle = 1re ligne + interlignes suivants (pas de leading fantôme
  // sous la dernière ligne), pour que le bloc reste centré si lineHeight bouge
  const blockH = size + lh * (lines.length - 1);
  let y = tcfg.centerY - blockH / 2 + size; // 1re baseline
  for (const line of lines) {
    fillCentered(ctx, line, cx, y, tcfg.letterSpacing, boost);
    y += lh;
  }

  // 5. sous-titre (italique, centré) + filets
  const scfg = CONFIG.subtitle;
  const ssize = fitSubtitle(ctx, subtitle, scfg);
  ctx.font = `${ssize}px ${scfg.font}`;
  ctx.fillStyle = scfg.color;
  ctx.textAlign = "center";
  ctx.fillText(subtitle, cx, scfg.y);

  if (scfg.rule.enabled) {
    const tw = ctx.measureText(subtitle).width;
    const ry = scfg.y - ssize * 0.32; // aligné au milieu optique du texte
    ctx.strokeStyle = `rgba(${CONFIG.colors.rule},${scfg.rule.alpha})`;
    ctx.lineWidth = scfg.rule.thickness;
    ctx.beginPath();
    ctx.moveTo(scfg.rule.innerX, ry);
    ctx.lineTo(cx - tw / 2 - scfg.rule.gap, ry);
    ctx.moveTo(cx + tw / 2 + scfg.rule.gap, ry);
    ctx.lineTo(W - scfg.rule.innerX, ry);
    ctx.stroke();
  }

  // 6. URL bas-droite
  const ucfg = CONFIG.url;
  ctx.font = `${ucfg.size}px ${ucfg.font}`;
  ctx.fillStyle = ucfg.color;
  ctx.textAlign = "right";
  ctx.fillText(ucfg.text, W - ucfg.rightMargin, ucfg.baselineY);

  // 7. export
  const ext = CONFIG.output.format === "jpeg" ? "jpg" : "png";
  const outPath = p("output", `${slug}.${ext}`);
  const buf = CONFIG.output.format === "jpeg"
    ? canvas.encode("jpeg", CONFIG.output.jpegQuality)
    : canvas.encode("png");
  fs.writeFileSync(outPath, await buf);
  console.log(`  ✓ ${slug} → output/${slug}.${ext}  (titre ${size}px / ${lines.length} lignes)`);
  return true;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  const articles = JSON.parse(fs.readFileSync(p("articles.json"), "utf8"));
  const asked = process.argv.slice(2);
  const todo = asked.length
    ? articles.filter((a) => asked.includes(a.slug))
    : articles;

  if (asked.length) {
    const known = new Set(articles.map((a) => a.slug));
    for (const s of asked) if (!known.has(s)) console.warn(`  ⚠  slug inconnu dans articles.json : ${s}`);
  }

  console.log(`Génération de ${todo.length} image(s)…`);
  let ok = 0;
  for (const a of todo) if (await render(a)) ok++;
  console.log(`\nTerminé : ${ok}/${todo.length} générée(s) dans output/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
