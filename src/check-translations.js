#!/usr/bin/env node
/**
 * check-translations.js — Auditoría de claves de traducción de RhinoPlan
 *
 * Uso:  node check-translations.js
 *       node check-translations.js ruta/App.jsx ruta/translations.js
 *
 * Detecta:
 *   1. Claves usadas en App.jsx (t.algo) que NO existen en translations.js
 *      -> son las que se renderizan vacías o imprimen "undefined" en el PDF
 *   2. Claves que faltan en algunos idiomas pero existen en otros
 *   3. Claves definidas que ya no se usan (candidatas a borrar)
 *   4. Valores vacíos o duplicados sospechosos
 */

const fs = require("fs");
const path = require("path");

const APP  = process.argv[2] || "src/App.jsx";
const TRAD = process.argv[3] || "src/translations.js";

// Nombres de variables que hacen shadowing de `t` en callbacks .map()
// Sus propiedades NO son traducciones. Añadir aquí si aparecen nuevos.
const CAMPOS_NO_TRADUCCION = new Set([
  "id", "label", "icon", "nombre", "descripcion", "anotaciones",
  "hex", "key", "value", "type", "x", "y", "points", "color", "size",
]);

function leer(f) {
  if (!fs.existsSync(f)) {
    console.error(`\n  ✗ No encuentro el archivo: ${f}`);
    console.error(`    Uso: node check-translations.js <App.jsx> <translations.js>\n`);
    process.exit(1);
  }
  return fs.readFileSync(f, "utf8");
}

// ---------- 1. Extraer las claves definidas por idioma ----------
function clavesPorIdioma(src) {
  const idiomas = {};
  // localiza los bloques "  xx: {" de primer nivel
  const re = /^  ([a-z]{2}):\s*\{/gm;
  const marcas = [];
  let m;
  while ((m = re.exec(src)) !== null) marcas.push({ lang: m[1], start: m.index });

  marcas.forEach((mk, i) => {
    const fin = i + 1 < marcas.length ? marcas[i + 1].start : src.length;
    const bloque = src.slice(mk.start, fin);
    const claves = new Map();
    // claves de tipo   nombre: "valor",
    const rk = /^\s{4}([A-Za-z_$][\w$]*)\s*:\s*(["'`])([\s\S]*?)\2\s*,?\s*$/gm;
    let k;
    while ((k = rk.exec(bloque)) !== null) claves.set(k[1], k[3]);
    idiomas[mk.lang] = claves;
  });
  return idiomas;
}

// ---------- 2. Extraer las claves usadas en el código ----------
function clavesUsadas(src) {
  const usadas = new Map(); // clave -> nº de apariciones
  const re = /\bt\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const k = m[1];
    usadas.set(k, (usadas.get(k) || 0) + 1);
  }
  return usadas;
}

// ---------- Ejecutar ----------
const srcApp  = leer(APP);
const srcTrad = leer(TRAD);

const idiomas = clavesPorIdioma(srcTrad);
const langs = Object.keys(idiomas);
if (!langs.length) {
  console.error("  ✗ No pude leer ningún bloque de idioma en translations.js");
  process.exit(1);
}

const base = langs[0]; // referencia: primer idioma (es)
const usadas = clavesUsadas(srcApp);

// Universo de claves definidas en cualquier idioma
const todasDefinidas = new Set();
langs.forEach(l => idiomas[l].forEach((_, k) => todasDefinidas.add(k)));

console.log("\n" + "=".repeat(62));
console.log("  AUDITORÍA DE TRADUCCIONES — RhinoPlan");
console.log("=".repeat(62));
console.log(`  App:          ${path.basename(APP)}`);
console.log(`  Traducciones: ${path.basename(TRAD)}`);
console.log(`  Idiomas:      ${langs.join(", ")}  (referencia: ${base})`);
console.log(`  Definidas:    ${todasDefinidas.size} claves`);
console.log(`  Usadas en JSX:${usadas.size} claves\n`);

let problemas = 0;

// ---- A. Usadas pero NO definidas en ningún idioma (las críticas) ----
const faltantes = [...usadas.keys()]
  .filter(k => !todasDefinidas.has(k))
  .filter(k => !CAMPOS_NO_TRADUCCION.has(k))
  .sort();

console.log("-".repeat(62));
console.log("  A. CRÍTICO — usadas en el código pero NO existen");
console.log("     (se renderizan vacías; en concatenaciones dan 'undefined')");
console.log("-".repeat(62));
if (!faltantes.length) {
  console.log("  ✓ Ninguna. Todas las claves usadas están definidas.\n");
} else {
  faltantes.forEach(k => console.log(`  ✗ t.${k}   (${usadas.get(k)} uso/s)`));
  console.log("");
  problemas += faltantes.length;
}

// ---- B. Posibles falsos positivos filtrados ----
const filtradas = [...usadas.keys()]
  .filter(k => !todasDefinidas.has(k) && CAMPOS_NO_TRADUCCION.has(k))
  .sort();
if (filtradas.length) {
  console.log("  · Ignoradas por ser campos de objetos (shadowing de `t`):");
  console.log("    " + filtradas.map(k => "t." + k).join(", ") + "\n");
}

// ---- C. Definidas en unos idiomas pero no en otros ----
console.log("-".repeat(62));
console.log("  B. INCOMPLETAS — faltan en algún idioma");
console.log("-".repeat(62));
const incompletas = [];
todasDefinidas.forEach(k => {
  const sin = langs.filter(l => !idiomas[l].has(k));
  if (sin.length) incompletas.push({ k, sin });
});
if (!incompletas.length) {
  console.log("  ✓ Todas las claves están en los " + langs.length + " idiomas.\n");
} else {
  incompletas.sort((a, b) => a.k.localeCompare(b.k))
    .forEach(({ k, sin }) => console.log(`  ✗ ${k}  →  falta en: ${sin.join(", ")}`));
  console.log("");
  problemas += incompletas.length;
}

// ---- D. Valores vacíos ----
console.log("-".repeat(62));
console.log("  C. VALORES VACÍOS");
console.log("-".repeat(62));
const vacias = [];
langs.forEach(l => idiomas[l].forEach((v, k) => {
  if (!v.trim()) vacias.push(`${l}.${k}`);
}));
if (!vacias.length) console.log("  ✓ Ninguna cadena vacía.\n");
else { vacias.forEach(x => console.log(`  ✗ ${x}`)); console.log(""); problemas += vacias.length; }

// ---- E. Definidas pero sin usar ----
console.log("-".repeat(62));
console.log("  D. SIN USAR — definidas pero no aparecen como t.<clave>");
console.log("     (informativo: pueden usarse dinámicamente o ser residuo)");
console.log("-".repeat(62));
const sinUsar = [...todasDefinidas].filter(k => !usadas.has(k)).sort();
if (!sinUsar.length) console.log("  ✓ Todas las claves definidas se usan.\n");
else {
  const porLinea = 4;
  for (let i = 0; i < sinUsar.length; i += porLinea)
    console.log("  · " + sinUsar.slice(i, i + porLinea).join(", "));
  console.log("");
}

// ---- Resumen ----
console.log("=".repeat(62));
if (problemas === 0) {
  console.log("  ✓ SIN PROBLEMAS — traducciones completas y coherentes");
} else {
  console.log(`  ✗ ${problemas} problema/s que corregir (secciones A, B y C)`);
}
console.log("=".repeat(62) + "\n");

process.exit(problemas > 0 ? 1 : 0);
