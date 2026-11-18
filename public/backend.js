// Livello dati: Firebase (reale) oppure localStorage (demo / sviluppo).
import { sampleStudents } from "./samples.js";
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // niente 0/O, 1/I/L
export const CODE_LEN = 12;

export function newCode() {
  const a = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => ALPH[x % ALPH.length]).join("");
}
export function newId() {
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => "abcdefghijkmnopqrstuvwxyz23456789"[x % 33]).join("");
}
export const normCode = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const fmtCode = (c) => (c.match(/.{1,4}/g) || []).join("-");

// dev = modalità sviluppo: dati di esempio solo nel browser, anche se Firebase è configurato.
export async function createBackend(cfg, { dev = false } = {}) {
  const k = cfg.firebase && cfg.firebase.apiKey;
  const demo = !k || k.startsWith("INSERISCI");
  if (dev) return demoBackend("pg_dev_v1", true);
  return demo ? demoBackend("pg_demo_v1", false) : firebaseBackend(cfg);
}

// ---------------------------------------------------------- Firebase
async function firebaseBackend(cfg) {
  const V = "10.12.2";
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = initializeApp(cfg.firebase);
  let db;
  try {
    // cache locale: funziona anche col segnale scarso al palaghiaccio
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }
  const auth = au.getAuth(app);
  const col = fs.collection(db, "students");
  const ref = (code) => fs.doc(col, code);

  return {
    demo: false,
    // Allenatrice: login anonimo (nessuna email/password). Il dispositivo è abilitato
    // se esiste il documento coaches/{uid}.
    onCoachAuth(cb) {
      return au.onAuthStateChanged(auth, async (u) => {
        if (!u) {
          try { await au.signInAnonymously(auth); } catch (e) { cb({ error: e }); }
          return;
        }
        try {
          const d = await fs.getDoc(fs.doc(db, "coaches", u.uid));
          cb({ uid: u.uid, isCoach: d.exists() });
        } catch (e) {
          cb({ uid: u.uid, isCoach: false, error: e });
        }
      });
    },
    async createTransfer() {
      const t = newCode();
      await fs.setDoc(fs.doc(db, "transfers", t), { by: auth.currentUser.uid, at: fs.serverTimestamp() });
      return t;
    },
    async redeemTransfer(t) {
      const uid = auth.currentUser.uid;
      await fs.setDoc(fs.doc(db, "coaches", uid), { via: t, at: fs.serverTimestamp() });
      try { await fs.deleteDoc(fs.doc(db, "transfers", t)); } catch {}
    },
    removeDevice: () => fs.deleteDoc(fs.doc(db, "coaches", auth.currentUser.uid)),
    restoreStudent: (code, data) => fs.setDoc(ref(code), data),
    watchStudents(cb, err) {
      return fs.onSnapshot(col, (s) => cb(s.docs.map((d) => ({ code: d.id, ...d.data() }))), err);
    },
    watchStudent(code, cb, err) {
      return fs.onSnapshot(ref(code),
        (d) => cb(d.exists() ? { code: d.id, ...d.data() } : null, { fromCache: d.metadata.fromCache }),
        err);
    },
    async createStudent(name, level = "base") {
      const code = newCode();
      await fs.setDoc(ref(code), { name, level, progress: [], plan: [], checks: {}, createdAt: Date.now() });
      return code;
    },
    updateStudent: (code, patch) => fs.updateDoc(ref(code), patch),
    deleteStudent: (code) => fs.deleteDoc(ref(code)),
    async regenerateCode(old) {
      const snap = await fs.getDoc(ref(old));
      const code = newCode();
      const b = fs.writeBatch(db);
      b.set(ref(code), snap.data());
      b.delete(ref(old));
      await b.commit();
      return code;
    },
    setCheck(code, id, val) {
      return fs.updateDoc(ref(code), {
        [`checks.${id}`]: val ? val : fs.deleteField(),
        checksAt: Date.now(),
      });
    },
    resetChecks: (code) => fs.updateDoc(ref(code), { checks: {}, checksAt: Date.now() }),
  };
}

// ---------------------------------------------------------- Demo
function demoBackend(KEY, dev) {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { students: {} }; }
    catch { return { students: {} }; }
  };
  let data = load();
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  const save = () => { localStorage.setItem(KEY, JSON.stringify(data)); emit(); };
  window.addEventListener("storage", (e) => { if (e.key === KEY) { data = load(); emit(); } });
  const sub = (f) => { subs.add(f); f(); return () => subs.delete(f); };

  const seed = () => {
    data = { students: sampleStudents(newCode, newId) };
    localStorage.setItem(KEY, JSON.stringify(data));
  };
  if (!Object.keys(data.students).length) {
    seed();
    if (dev) localStorage.setItem(KEY + "_coach", JSON.stringify({ uid: "dev" }));
  }

  let coach = JSON.parse(localStorage.getItem(KEY + "_coach") || "null");
  const aSubs = new Set();
  const setCoach = (c) => {
    coach = c;
    c ? localStorage.setItem(KEY + "_coach", JSON.stringify(c)) : localStorage.removeItem(KEY + "_coach");
    aSubs.forEach((f) => f(coach));
  };
  const S = (code) => data.students[code];

  return {
    demo: true,
    dev,
    sampleCodes: () => Object.entries(data.students).map(([code, st]) => ({ code, name: st.name })),
    async reseed() { seed(); emit(); },
    onCoachAuth(cb) {
      const f = (c) => cb(c ? { uid: "demo", isCoach: true } : { uid: "DEMO-DISPOSITIVO", isCoach: false });
      aSubs.add(f); f(coach); return () => aSubs.delete(f);
    },
    async demoEnable() { setCoach({ uid: "demo" }); },
    async createTransfer() { return "DEMOTRASFER1"; },
    async redeemTransfer() { setCoach({ uid: "demo" }); },
    async removeDevice() { setCoach(null); },
    async restoreStudent(code, d) { data.students[code] = clone(d); save(); },
    watchStudents(cb) {
      return sub(() => cb(Object.entries(data.students).map(([code, s]) => ({ code, ...clone(s) }))));
    },
    watchStudent(code, cb) {
      return sub(() => { const s = S(code); cb(s ? { code, ...clone(s) } : null, { fromCache: false }); });
    },
    async createStudent(name, level = "base") {
      const code = newCode();
      data.students[code] = { name, level, progress: [], plan: [], checks: {}, createdAt: Date.now() };
      save();
      return code;
    },
    async updateStudent(code, patch) { Object.assign(S(code), clone(patch)); save(); },
    async deleteStudent(code) { delete data.students[code]; save(); },
    async regenerateCode(old) {
      const code = newCode();
      data.students[code] = data.students[old];
      delete data.students[old];
      save();
      return code;
    },
    async setCheck(code, id, val) {
      const s = S(code);
      s.checks = s.checks || {};
      if (val) s.checks[id] = val; else delete s.checks[id];
      s.checksAt = Date.now();
      save();
    },
    async resetChecks(code) { S(code).checks = {}; S(code).checksAt = Date.now(); save(); },
  };
}
