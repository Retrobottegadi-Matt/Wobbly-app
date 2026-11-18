// Genera esempio-alunni.json (alunni finti con codici casuali) da importare con "Ripristina da backup".
// Uso: node tools/genera-esempi.mjs "$(pwd)"
import { webcrypto } from "node:crypto";
import { writeFileSync } from "node:fs";
globalThis.crypto ??= webcrypto;
const { sampleStudents } = await import(process.argv[2] + "/public/samples.js");
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const rnd = (n, a) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => a[x % a.length]).join("");
const st = sampleStudents(() => rnd(12, ALPH), () => rnd(8, "abcdefghijkmnopqrstuvwxyz23456789"));
// nel database vero niente codici fissi: anche il primo diventa casuale
const out = Object.entries(st).map(([code, s]) => ({ code: code === "DEMOALUNNO23" ? rnd(12, ALPH) : code, ...s }));
writeFileSync(process.argv[2] + "/esempio-alunni.json",
  JSON.stringify({ app: "pattinaggio", version: 1, exportedAt: new Date().toISOString(), students: out }, null, 1));
console.log(out.length, "alunni", out.map((s) => s.name + ":" + s.progress.length + "/" + s.plan.length).join(" "));
