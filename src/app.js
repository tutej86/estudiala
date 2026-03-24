// =============================================
//  ESTUDIALA — app.js
//  Firebase Auth + Firestore + Google Drive + IA
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── CONFIG ────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDexQsu7o65XQH9-YohtVosRy6cgcwadxY",
  authDomain: "estudiala-bca83.firebaseapp.com",
  projectId: "estudiala-bca83",
  storageBucket: "estudiala-bca83.firebasestorage.app",
  messagingSenderId: "643534342160",
  appId: "1:643534342160:web:6d71d3924f3de71290e295",
  measurementId: "G-JY8KK0SCBV"
};

const GEMINI_KEY = "gen-lang-client-0450838248";

// Google Drive
const GDRIVE_CLIENT_ID = "643534342160-9601bvqjgo3jqk4dadncua4ug2lc1i5p.apps.googleusercontent.com";
const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
let gdriveToken = null;

// ── INIT ─────────────────────────────────────
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let currentUser = null;
let currentFilter = null;
let aiCache = {};
let currentStudyForShare = null;

// ── CHECK IF SHARED LINK ─────────────────────
const urlParams = new URLSearchParams(window.location.search);
const sharedStudyId = urlParams.get("compartir");

if (sharedStudyId) {
  showSharedStudy(sharedStudyId);
} else {
  initAuth();
}

function initAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      showApp(user);
      loadAndRenderInicio();
    } else {
      currentUser = null;
      showLogin();
    }
  });
}

async function showSharedStudy(id) {
  // Show a minimal shared view without requiring login
  document.getElementById("screen-login").classList.remove("active");
  document.getElementById("screen-app").classList.remove("active");

  document.body.innerHTML = `
    <div style="font-family:'DM Sans',sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;color:#1a1814">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e5e2de">
        <span style="color:#2563eb;font-size:18px">✦</span>
        <span style="font-family:'Instrument Serif',serif;font-size:20px">Estudiala</span>
      </div>
      <div id="shared-content">
        <div style="text-align:center;padding:40px;color:#a8a29c">Cargando estudio...</div>
      </div>
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e2de;text-align:center">
        <a href="/" style="font-size:13px;color:#2563eb;text-decoration:none">Guardá tus propios estudios en Estudiala →</a>
      </div>
    </div>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  `;

  try {
    const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap = await getDoc(doc(db, "studies", id));

    if (!snap.exists()) {
      document.getElementById("shared-content").innerHTML = `<div style="text-align:center;padding:40px;color:#a8a29c">Este estudio no existe o fue eliminado.</div>`;
      return;
    }

    const s = snap.data();
    if (!s.shared) {
      document.getElementById("shared-content").innerHTML = `<div style="text-align:center;padding:40px;color:#a8a29c">Este estudio no está disponible para compartir.</div>`;
      return;
    }

    const badgeColors = {
      "Laboratorio": "background:#f0fdf4;color:#15803d",
      "Imágenes": "background:#eff4ff;color:#1d4ed8",
      "Informe": "background:#fffbeb;color:#92400e",
      "Receta": "background:#fdf2f8;color:#9d174d",
      "Nota": "background:#f3f1ee;color:#6b6560"
    };
    const badgeStyle = badgeColors[s.type] || badgeColors["Nota"];
    const dateStr = s.date ? new Date(s.date).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "";

    document.getElementById("shared-content").innerHTML = `
      <span style="display:inline-block;${badgeStyle};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px">${s.type}</span>
      <h1 style="font-family:'Instrument Serif',serif;font-size:26px;margin-bottom:6px;line-height:1.2">${s.title}</h1>
      <p style="font-size:13px;color:#a8a29c;margin-bottom:20px">${s.institution || ""} ${dateStr ? "· " + dateStr : ""} ${s.doctor ? "· " + s.doctor : ""}</p>

      ${s.aiSummary ? `
        <div style="background:#eff4ff;border-radius:12px;padding:16px;margin-bottom:20px">
          <div style="font-size:11px;font-weight:500;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">✦ Resumen de IA</div>
          <div style="font-size:14px;color:#1e3a8a;line-height:1.65">${s.aiSummary}</div>
        </div>
      ` : ""}

      ${s.notes ? `
        <div style="background:#f3f1ee;border-radius:10px;padding:14px;margin-bottom:20px;font-size:14px;line-height:1.6;color:#6b6560">${s.notes}</div>
      ` : ""}

      ${s.fileUrl ? `
        <a href="${s.fileUrl}" target="_blank" style="display:flex;align-items:center;gap:8px;padding:12px 14px;border:1px solid #e5e2de;border-radius:10px;font-size:13px;color:#2563eb;text-decoration:none;margin-bottom:16px">
          📎 Ver archivo original
        </a>
      ` : ""}
    `;
  } catch(e) {
    document.getElementById("shared-content").innerHTML = `<div style="text-align:center;padding:40px;color:#a8a29c">Error al cargar el estudio.</div>`;
  }
}

document.getElementById("btn-login").addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    toast("Error al iniciar sesión. Intentá de nuevo.");
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
});

function showLogin() {
  document.getElementById("screen-login").classList.add("active");
  document.getElementById("screen-app").classList.remove("active");
}

function showApp(user) {
  document.getElementById("screen-login").classList.remove("active");
  document.getElementById("screen-app").classList.add("active");

  // User info
  document.getElementById("user-name").textContent = user.displayName || "Usuario";
  document.getElementById("user-email").textContent = user.email || "";
  const avatarEl = document.getElementById("user-avatar");
  if (user.photoURL) {
    avatarEl.innerHTML = `<img src="${user.photoURL}" alt="avatar">`;
  } else {
    avatarEl.textContent = (user.displayName || "U")[0].toUpperCase();
  }
}

// ── NAV ───────────────────────────────────────
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    const section = item.dataset.section;
    const filter = item.dataset.filter || null;
    currentFilter = filter;
    setActiveNav(item);
    navigateTo(section, filter);
    closeSidebar();
  });
});

function navigateTo(section, filter = null) {
  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.style.display = "none";
  if (section === "inicio") loadAndRenderInicio();
  else if (section === "estudios") { loadAndRenderEstudios(filter); initSearch(); if(searchBox) searchBox.style.display="block"; }
  else if (section === "timeline") renderTimeline();
  else if (section === "perfil") renderPerfil();
  else if (section === "resumen") { document.getElementById("topbar-title").textContent = "Resumen de salud"; renderResumenSalud(); }
  else if (section === "subir") renderSubir();
}

document.getElementById("btn-upload-top").addEventListener("click", () => {
  renderSubir();
  setActiveNavBySection("subir");
  closeSidebar();
});

document.getElementById("btn-menu").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

function setActiveNav(el) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  el.classList.add("active");
}

function setActiveNavBySection(section) {
  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.remove("active");
    if (n.dataset.section === section && !n.dataset.filter) n.classList.add("active");
  });
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
}

// ── FIRESTORE HELPERS ─────────────────────────
async function getStudies(filter = null) {
  if (!currentUser) return [];
  try {
    let q;
    const col = collection(db, "studies");
    if (filter) {
      q = query(col, where("userId", "==", currentUser.uid), where("type", "==", filter), orderBy("createdAt", "desc"));
    } else {
      q = query(col, where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error obteniendo estudios:", e);
    return [];
  }
}

async function saveStudy(data) {
  if (!currentUser) return null;
  const doc_ = await addDoc(collection(db, "studies"), {
    ...data,
    userId: currentUser.uid,
    createdAt: new Date().toISOString(),
  });
  return doc_.id;
}

async function updateStudyAI(id, summary) {
  try {
    await updateDoc(doc(db, "studies", id), { aiSummary: summary });
  } catch (e) {
    console.error("Error guardando resumen IA:", e);
  }
}

// ── GOOGLE DRIVE UPLOAD ──────────────────────
async function getGDriveToken() {
  if (gdriveToken) return gdriveToken;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) reject(resp.error);
        else { gdriveToken = resp.access_token; resolve(gdriveToken); }
      }
    });
    client.requestAccessToken();
  });
}

async function uploadToGDrive(file, onProgress) {
  const token = await getGDriveToken();

  // Create file metadata
  const metadata = { name: file.name, mimeType: file.type };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink");
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = async () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        // Make file publicly readable
        await fetch(`https://www.googleapis.com/drive/v3/files/${res.id}/permissions`, {
          method: "POST",
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "reader", type: "anyone" })
        });
        resolve({ url: `https://drive.google.com/file/d/${res.id}/preview`, fileId: res.id });
      } else {
        reject(new Error("Error subiendo a Google Drive"));
      }
    };
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.send(form);
  });
}

// ── ANTHROPIC AI ──────────────────────────────
async function callAI(systemPrompt, userMessage) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }]
    })
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar respuesta.";
}

async function analyzeStudy(study) {
  if (aiCache[study.id]) return aiCache[study.id];
  if (study.aiSummary) {
    aiCache[study.id] = study.aiSummary;
    return study.aiSummary;
  }
  const system = `Sos un asistente médico que ayuda a pacientes argentinos a entender sus estudios médicos. Usá español rioplatense (vos). Sé claro, simple y tranquilizador. Nunca alarmés. Siempre indicá que el médico es quien debe interpretar los resultados de forma definitiva. Respondé en máximo 4 oraciones.`;
  const msg = `Tipo de estudio: ${study.type}\nNombre: ${study.title}\nInstitución: ${study.institution || ""}\nFecha: ${study.date || ""}\nNotas: ${study.notes || ""}\n\nResumí este estudio para el paciente de forma simple y tranquilizadora.`;
  const summary = await callAI(system, msg);
  aiCache[study.id] = summary;
  await updateStudyAI(study.id, summary);
  return summary;
}

// ── RENDER INICIO ─────────────────────────────
async function loadAndRenderInicio() {
  document.getElementById("topbar-title").textContent = "Inicio";
  setActiveNavBySection("inicio");
  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.style.display = "none";
  const content = document.getElementById("content-area");
  content.innerHTML = `<div class="spinner"></div>`;
  const studies = await getStudies();

  const total = studies.length;
  const thisYear = studies.filter(s => s.date && s.date.startsWith(new Date().getFullYear().toString())).length;
  const withAI = studies.filter(s => s.aiSummary).length;

  content.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${total}</div></div>
      <div class="stat-card"><div class="stat-label">Este año</div><div class="stat-value">${thisYear}</div></div>
      <div class="stat-card"><div class="stat-label">Con resumen IA</div><div class="stat-value">${withAI}</div></div>
      <div class="stat-card"><div class="stat-label">Tipos</div><div class="stat-value">${countTypes(studies)}</div></div>
    </div>
    <div class="section-header">
      <div class="section-title">Últimos estudios</div>
      <button class="section-link" onclick="window._navEstudios()">Ver todos →</button>
    </div>
    ${studies.length === 0 ? emptyState() : renderGrid(studies.slice(0, 6))}
  `;
}

window._navEstudios = () => {
  setActiveNavBySection("estudios");
  loadAndRenderEstudios(null);
};

function countTypes(studies) {
  return new Set(studies.map(s => s.type)).size;
}

// ── RENDER ESTUDIOS ───────────────────────────
async function loadAndRenderEstudios(filter) {
  currentFilter = filter;
  document.getElementById("topbar-title").textContent = filter || "Todos los estudios";
  const searchBox = document.getElementById("search-box");
  if (searchBox) { searchBox.style.display = "block"; initSearch(); }
  const content = document.getElementById("content-area");
  content.innerHTML = `<div class="spinner"></div>`;
  const studies = await getStudies(filter);

  content.innerHTML = `
    <div class="filters-row">
      <div class="filter-chip ${!filter ? "active" : ""}" onclick="window._filterStudies(null)">Todos</div>
      <div class="filter-chip ${filter === "Laboratorio" ? "active" : ""}" onclick="window._filterStudies('Laboratorio')">🧪 Laboratorio</div>
      <div class="filter-chip ${filter === "Imágenes" ? "active" : ""}" onclick="window._filterStudies('Imágenes')">🩻 Imágenes</div>
      <div class="filter-chip ${filter === "Informe" ? "active" : ""}" onclick="window._filterStudies('Informe')">📄 Informes</div>
      <div class="filter-chip ${filter === "Receta" ? "active" : ""}" onclick="window._filterStudies('Receta')">💊 Recetas</div>
      <div class="filter-chip ${filter === "Nota" ? "active" : ""}" onclick="window._filterStudies('Nota')">✏ Notas</div>
    </div>
    ${studies.length === 0 ? emptyState() : renderGrid(studies)}
  `;
}

window._filterStudies = (f) => {
  loadAndRenderEstudios(f);
};

function emptyState() {
  return `<div class="empty-state">
    <div class="empty-icon">📂</div>
    <div class="empty-title">No tenés estudios acá todavía</div>
    <div class="empty-desc">Subí tu primer estudio y la IA lo va a analizar automáticamente.</div>
  </div>`;
}

function renderGrid(studies) {
  return `<div class="estudios-grid">${studies.map(cardHTML).join("")}</div>`;
}

function cardHTML(s) {
  const badgeClass = {
    "Laboratorio": "badge-lab",
    "Imágenes": "badge-img",
    "Informe": "badge-inf",
    "Receta": "badge-rx",
    "Nota": "badge-nota"
  }[s.type] || "badge-nota";

  const dateStr = s.date ? new Date(s.date).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "";

  return `<div class="estudio-card" onclick="window._openStudy('${s.id}')">
    <div class="card-badge ${badgeClass}">${s.type}</div>
    <div class="card-title">${s.title}</div>
    <div class="card-meta">${s.institution || ""}</div>
    <div class="card-footer">
      <span class="card-date">${dateStr}</span>
      <div style="display:flex;gap:5px;align-items:center">
        ${s.aiSummary ? '<span class="card-ai">✦ IA</span>' : ""}
        <button class="card-share" onclick="event.stopPropagation(); window._openShare('${s.id}')">↗ Compartir</button>
      </div>
    </div>
  </div>`;
}

// ── OPEN STUDY PANEL ──────────────────────────
let allStudiesCache = {};

window._openStudy = async (id) => {
  const overlay = document.getElementById("panel-overlay");
  const panel = document.getElementById("detail-panel");
  overlay.classList.add("open");

  // Get study from Firestore
  const studies = await getStudies();
  const study = studies.find(s => s.id === id);
  if (!study) return;
  allStudiesCache[id] = study;

  const badgeClass = {
    "Laboratorio": "badge-lab", "Imágenes": "badge-img",
    "Informe": "badge-inf", "Receta": "badge-rx", "Nota": "badge-nota"
  }[study.type] || "badge-nota";

  const dateStr = study.date ? new Date(study.date).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "";

  panel.innerHTML = `
    <button class="panel-close" onclick="window._closePanel()">✕</button>
    <div class="panel-badge"><span class="card-badge ${badgeClass}">${study.type}</span></div>
    <div class="panel-title">${study.title}</div>
    <div class="panel-meta">${study.institution || ""} ${dateStr ? "· " + dateStr : ""} ${study.doctor ? "· " + study.doctor : ""}</div>

    <div class="ai-summary-box" id="ai-box-${id}">
      <div class="ai-summary-label">✦ Resumen de IA</div>
      ${study.aiSummary
        ? `<div class="ai-summary-text">${study.aiSummary}</div>`
        : `<div class="ai-loading"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><span>Analizando estudio...</span></div>`
      }
    </div>

    ${study.fileUrl ? `
      <div style="margin-bottom:16px">
        <a href="${study.fileUrl}" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 13px;border:1px solid var(--border2);border-radius:var(--radius);font-size:13px;color:var(--accent);text-decoration:none;">
          📎 Ver archivo original
        </a>
      </div>
    ` : ""}

    ${study.notes ? `
      <div style="margin-bottom:16px;background:var(--bg2);border-radius:var(--radius);padding:12px;font-size:13px;line-height:1.6;color:var(--text2)">
        ${study.notes}
      </div>
    ` : ""}

    <div class="panel-actions">
      <button class="btn-share-main" onclick="window._openShare('${id}')">↗ Compartir con médico</button>
      <button class="btn-outline" onclick="window._deleteStudy('${id}')">🗑</button>
    </div>

    <div class="ask-ai-section">
      <div class="ask-title">Preguntarle a la IA</div>
      <div class="ask-input-row">
        <input class="ask-input" id="ask-input-${id}" placeholder="Ej: ¿Qué significa este resultado?">
        <button class="btn-ask" onclick="window._askAI('${id}')">→</button>
      </div>
      <div class="ask-answer" id="ask-answer-${id}"></div>
    </div>
  `;

  // Trigger AI analysis if not cached
  if (!study.aiSummary) {
    try {
      const summary = await analyzeStudy(study);
      const box = document.getElementById(`ai-box-${id}`);
      if (box) box.innerHTML = `<div class="ai-summary-label">✦ Resumen de IA</div><div class="ai-summary-text">${summary}</div>`;
    } catch(e) {
      const box = document.getElementById(`ai-box-${id}`);
      if (box) box.innerHTML = `<div class="ai-summary-label">✦ Resumen de IA</div><div class="ai-summary-text" style="color:var(--text3)">No se pudo generar el resumen automático.</div>`;
    }
  }
};

window._closePanel = () => {
  document.getElementById("panel-overlay").classList.remove("open");
};

document.getElementById("panel-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("panel-overlay")) window._closePanel();
});

// ── ASK AI ────────────────────────────────────
window._askAI = async (studyId) => {
  const input = document.getElementById(`ask-input-${studyId}`);
  const answerEl = document.getElementById(`ask-answer-${studyId}`);
  const question = input?.value?.trim();
  if (!question) return;

  const study = allStudiesCache[studyId];
  answerEl.style.display = "block";
  answerEl.innerHTML = `<div class="ai-loading"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><span>Pensando...</span></div>`;

  try {
    const system = `Sos un asistente médico que ayuda a pacientes argentinos. Usá español rioplatense (vos), explicá de forma simple. Siempre recomendá consultar al médico para interpretaciones definitivas.`;
    const msg = `Estudio: ${study?.title || ""} (${study?.type || ""})\nContexto: ${study?.notes || ""}\n${study?.aiSummary ? "Resumen previo: " + study.aiSummary : ""}\n\nPregunta del paciente: ${question}`;
    const answer = await callAI(system, msg);
    answerEl.textContent = answer;
  } catch(e) {
    answerEl.textContent = "No se pudo conectar con la IA. Intentá de nuevo.";
  }
};

// ── DELETE STUDY ──────────────────────────────
window._deleteStudy = async (id) => {
  if (!confirm("¿Seguro que querés eliminar este estudio?")) return;
  try {
    await deleteDoc(doc(db, "studies", id));
    window._closePanel();
    toast("Estudio eliminado");
    loadAndRenderEstudios(currentFilter);
  } catch(e) {
    toast("Error al eliminar");
  }
};

// ── SHARE ─────────────────────────────────────
window._openShare = async (id) => {
  currentStudyForShare = id;
  const studies = await getStudies();
  const study = studies.find(s => s.id === id);
  const modal = document.getElementById("share-modal");
  const box = document.getElementById("share-box");

  box.innerHTML = `
    <div class="modal-close-row">
      <div>
        <div class="modal-title">Compartir estudio</div>
        <div class="modal-sub">${study?.title || "Estudio"}</div>
      </div>
      <button class="panel-close" style="position:static" onclick="window._closeShare()">✕</button>
    </div>

    <div class="share-option" onclick="window._shareLink('${id}')">
      <div class="share-option-icon">🔗</div>
      <div>
        <div class="share-option-label">Generar link seguro</div>
        <div class="share-option-desc">Link directo para enviarle al médico</div>
      </div>
    </div>
    <div class="share-option" onclick="window._shareWhatsApp('${id}')">
      <div class="share-option-icon">💬</div>
      <div>
        <div class="share-option-label">Enviar por WhatsApp</div>
        <div class="share-option-desc">Abre WhatsApp con el link listo</div>
      </div>
    </div>
    <div class="share-option" onclick="window._shareEmail('${id}')">
      <div class="share-option-icon">✉️</div>
      <div>
        <div class="share-option-label">Enviar por email</div>
        <div class="share-option-desc">Abre tu correo con el link adjunto</div>
      </div>
    </div>
    ${study?.fileUrl ? `
    <div class="share-option" onclick="window.open('${study.fileUrl}', '_blank')">
      <div class="share-option-icon">📥</div>
      <div>
        <div class="share-option-label">Ver / descargar archivo</div>
        <div class="share-option-desc">Abre el PDF o imagen original</div>
      </div>
    </div>` : ""}

    <div class="link-copy-row" id="link-copy-row">
      <input class="link-copy-input" id="link-copy-val" readonly>
      <button class="btn-copy" onclick="window._copyLink()">Copiar</button>
    </div>
  `;

  modal.classList.add("open");
};

window._closeShare = () => document.getElementById("share-modal").classList.remove("open");
document.getElementById("share-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("share-modal")) window._closeShare();
});

window._shareLink = async (id) => {
  // Mark study as shared in Firestore so it's publicly readable
  try {
    await updateDoc(doc(db, "studies", id), { shared: true });
  } catch(e) {
    console.error("Error marcando estudio como compartido:", e);
  }
  const link = `${window.location.origin}?compartir=${id}`;
  document.getElementById("link-copy-val").value = link;
  document.getElementById("link-copy-row").style.display = "flex";
};

window._copyLink = () => {
  const val = document.getElementById("link-copy-val").value;
  navigator.clipboard?.writeText(val);
  toast("Link copiado al portapapeles ✓");
};

window._shareWhatsApp = async (id) => {
  try { await updateDoc(doc(db, "studies", id), { shared: true }); } catch(e) {}
  const link = `${window.location.origin}?compartir=${id}`;
  const text = encodeURIComponent(`Te comparto un estudio médico desde Estudiala: ${link}`);
  window.open(`https://wa.me/?text=${text}`, "_blank");
};

window._shareEmail = async (id) => {
  try { await updateDoc(doc(db, "studies", id), { shared: true }); } catch(e) {}
  const link = `${window.location.origin}?compartir=${id}`;
  const subject = encodeURIComponent("Estudio médico compartido desde Estudiala");
  const body = encodeURIComponent(`Te comparto un estudio médico. Podés verlo en el siguiente link:\n\n${link}`);
  window.open(`mailto:?subject=${subject}&body=${body}`);
};

// ── UPLOAD / SUBIR ────────────────────────────
let uploadMode = "archivo";
let selectedFile = null;

function renderSubir() {
  document.getElementById("topbar-title").textContent = "Subir estudio";
  const content = document.getElementById("content-area");
  content.innerHTML = `
    <div class="upload-container">
      <div class="upload-tabs">
        <button class="upload-tab active" id="tab-archivo" onclick="window._switchTab('archivo')">📎 Subir archivo</button>
        <button class="upload-tab" id="tab-nota" onclick="window._switchTab('nota')">✏ Escribir nota</button>
      </div>
      <div id="tab-body"></div>
    </div>
  `;
  renderTabContent("archivo");
}

window._switchTab = (mode) => {
  uploadMode = mode;
  selectedFile = null;
  document.getElementById("tab-archivo").classList.toggle("active", mode === "archivo");
  document.getElementById("tab-nota").classList.toggle("active", mode === "nota");
  renderTabContent(mode);
};

function renderTabContent(mode) {
  const body = document.getElementById("tab-body");
  const fileZone = mode === "archivo" ? `
    <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
      <div class="upload-zone-icon">📎</div>
      <div class="upload-zone-title">Tocá para seleccionar archivo</div>
      <div class="upload-zone-sub">PDF, JPG, PNG · hasta 10 MB</div>
    </div>
    <input type="file" id="file-input" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="window._onFileSelected(this)">
    <div class="progress-bar" id="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
  ` : `
    <div class="form-card" style="margin-bottom:16px">
      <div class="form-row">
        <div class="field-label">Título de la nota</div>
        <input class="field-input" id="nota-title" placeholder="Ej: Síntomas del 20 de marzo">
      </div>
      <div class="form-row">
        <div class="field-label">Escribí tu nota</div>
        <textarea class="field-textarea" id="nota-content" placeholder="Ej: Tres días con dolor de cabeza por las tardes. Sin fiebre..."></textarea>
      </div>
    </div>
  `;

  body.innerHTML = `
    ${fileZone}
    <div class="form-card">
      <div class="form-row form-grid-2">
        <div>
          <div class="field-label">Tipo de estudio</div>
          <select class="field-select" id="field-type">
            <option value="Laboratorio">Laboratorio</option>
            <option value="Imágenes">Imágenes</option>
            <option value="Informe">Informe</option>
            <option value="Receta">Receta</option>
            <option value="Nota">Nota</option>
          </select>
        </div>
        <div>
          <div class="field-label">Fecha del estudio</div>
          <input type="date" class="field-input" id="field-date" value="${new Date().toISOString().split("T")[0]}">
        </div>
      </div>
      <div class="form-row">
        <div class="field-label">Nombre del estudio</div>
        <input class="field-input" id="field-title" placeholder="Ej: Hemograma completo">
      </div>
      <div class="form-row">
        <div class="field-label">Médico / Institución</div>
        <input class="field-input" id="field-institution" placeholder="Ej: Dr. García / Hospital Italiano">
      </div>
      <div class="form-row">
        <div class="field-label">Notas adicionales (opcional)</div>
        <input class="field-input" id="field-notes" placeholder="Ej: Pedido por Dr. López">
      </div>
    </div>
    <div class="ai-toggle">
      <div class="ai-toggle-icon">✦</div>
      <div class="ai-toggle-text">
        <strong>Analizar con IA al guardar</strong>
        Claude va a leer el estudio y generarte un resumen automático en español
      </div>
    </div>
    <button class="btn-save" id="btn-save" onclick="window._saveStudy()">Guardar estudio</button>
  `;
}

window._onFileSelected = (input) => {
  const file = input.files[0];
  if (!file) return;
  selectedFile = file;
  const zone = document.getElementById("upload-zone");
  if (zone) zone.innerHTML = `<div class="upload-zone-icon">✅</div><div class="upload-zone-title">${file.name}</div><div class="upload-zone-sub">${(file.size / 1024 / 1024).toFixed(1)} MB · Tocá para cambiar</div>`;
};

window._saveStudy = async () => {
  const btn = document.getElementById("btn-save");
  const title = uploadMode === "nota"
    ? document.getElementById("nota-title")?.value?.trim()
    : document.getElementById("field-title")?.value?.trim();
  const type = document.getElementById("field-type")?.value;
  const date = document.getElementById("field-date")?.value;
  const institution = document.getElementById("field-institution")?.value?.trim();
  const notes = uploadMode === "nota"
    ? document.getElementById("nota-content")?.value?.trim()
    : document.getElementById("field-notes")?.value?.trim();

  if (!title) { toast("Poné un nombre al estudio"); return; }

  btn.disabled = true;
  btn.textContent = "Guardando...";

  let fileUrl = null;
  let filePublicId = null;

  // Upload file if present
  if (uploadMode === "archivo" && selectedFile) {
    try {
      const bar = document.getElementById("progress-bar");
      const fill = document.getElementById("progress-fill");
      if (bar) bar.style.display = "block";
      btn.textContent = "Subiendo archivo...";
      const result = await uploadToGDrive(selectedFile, (pct) => {
        if (fill) fill.style.width = pct + "%";
      });
      fileUrl = result.url;
    } catch(e) {
      toast("Error al subir el archivo. Intentá de nuevo.");
      btn.disabled = false;
      btn.textContent = "Guardar estudio";
      return;
    }
  }

  try {
    await saveStudy({ title, type, date, institution, notes, fileUrl, filePublicId });
    toast("¡Estudio guardado! ✓");
    setActiveNavBySection("estudios");
    loadAndRenderEstudios(null);
  } catch(e) {
    toast("Error al guardar. Intentá de nuevo.");
    btn.disabled = false;
    btn.textContent = "Guardar estudio";
  }
};

// ── TOAST ─────────────────────────────────────
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

// ── MANIFEST PWA ──────────────────────────────
// (served as /manifest.json via public folder)

// ── SEARCH ────────────────────────────────────
let searchTimeout = null;

function initSearch() {
  const input = document.getElementById("search-input");
  const box = document.getElementById("search-box");
  if (!input) return;
  box.style.display = "block";
  input.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length > 1) renderSearch(q);
      else if (q.length === 0) loadAndRenderEstudios(null);
    }, 300);
  });
}

async function renderSearch(query) {
  const studies = await getStudies();
  const filtered = studies.filter(s =>
    s.title?.toLowerCase().includes(query) ||
    s.institution?.toLowerCase().includes(query) ||
    s.doctor?.toLowerCase().includes(query) ||
    s.notes?.toLowerCase().includes(query) ||
    s.type?.toLowerCase().includes(query)
  );
  const content = document.getElementById("content-area");
  content.innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:14px">${filtered.length} resultado${filtered.length !== 1 ? "s" : ""} para "${query}"</div>
    ${filtered.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Sin resultados</div><div class="empty-desc">Probá con otro término</div></div>`
      : renderGrid(filtered)
    }
  `;
}

// ── TIMELINE ──────────────────────────────────
async function renderTimeline() {
  document.getElementById("topbar-title").textContent = "Línea de tiempo";
  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.style.display = "none";

  const content = document.getElementById("content-area");
  content.innerHTML = `<div class="spinner"></div>`;
  const studies = await getStudies();

  if (studies.length === 0) {
    content.innerHTML = emptyState();
    return;
  }

  // Group by month/year
  const groups = {};
  studies.forEach(s => {
    const d = s.date ? new Date(s.date) : new Date(s.createdAt);
    const key = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  const badgeClass = { "Laboratorio": "timeline-dot-lab", "Imágenes": "timeline-dot-img", "Informe": "timeline-dot-inf", "Receta": "timeline-dot-rx", "Nota": "timeline-dot-nota" };

  const html = Object.entries(groups).map(([month, items]) => `
    <div class="timeline-group">
      <div class="timeline-month">${month}</div>
      ${items.map(s => {
        const dateStr = s.date ? new Date(s.date).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : "";
        return `<div class="timeline-item ${badgeClass[s.type] || ""}" onclick="window._openStudy('${s.id}')">
          <div class="timeline-item-body">
            <div class="timeline-item-title">${s.title}</div>
            <div class="timeline-item-meta">${s.institution || ""} ${s.type ? "· " + s.type : ""}</div>
          </div>
          <div class="timeline-item-date">${dateStr}</div>
        </div>`;
      }).join("")}
    </div>
  `).join("");

  content.innerHTML = `<div class="timeline">${html}</div>`;
}

// ── PERFIL MÉDICO ─────────────────────────────
async function loadProfile() {
  if (!currentUser) return {};
  try {
    const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap = await getDoc(fsDoc(db, "profiles", currentUser.uid));
    return snap.exists() ? snap.data() : {};
  } catch(e) { return {}; }
}

async function saveProfile(data) {
  if (!currentUser) return;
  await updateDoc ? null : null;
  const { setDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  await setDoc(fsDoc(db, "profiles", currentUser.uid), data, { merge: true });
}

async function renderPerfil() {
  document.getElementById("topbar-title").textContent = "Perfil médico";
  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.style.display = "none";

  const content = document.getElementById("content-area");
  content.innerHTML = `<div class="spinner"></div>`;

  const profile = await loadProfile();

  const alergias = profile.alergias || [];
  const medicacion = profile.medicacion || [];
  const antecedentes = profile.antecedentes || [];

  content.innerHTML = `
    <div style="max-width:640px">

      <div class="emergency-card">
        <div class="emergency-title">🚨 Datos de emergencia</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-row">
            <div class="field-label">Grupo sanguíneo</div>
            <select class="field-select" id="p-sangre">
              <option value="">No sé / No especificado</option>
              ${["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => `<option ${profile.sangre===g?"selected":""}>${g}</option>`).join("")}
            </select>
          </div>
          <div class="form-row">
            <div class="field-label">Factor RH</div>
            <select class="field-select" id="p-rh">
              <option value="">No sé</option>
              <option ${profile.rh==="Positivo"?"selected":""}>Positivo</option>
              <option ${profile.rh==="Negativo"?"selected":""}>Negativo</option>
            </select>
          </div>
          <div class="form-row">
            <div class="field-label">Contacto de emergencia</div>
            <input class="field-input" id="p-contacto" placeholder="Nombre y teléfono" value="${profile.contacto||""}">
          </div>
          <div class="form-row">
            <div class="field-label">Obra social / Prepaga</div>
            <input class="field-input" id="p-cobertura" placeholder="Ej: OSDE 210" value="${profile.cobertura||""}">
          </div>
        </div>
      </div>

      <div class="profile-grid">
        <div class="profile-card">
          <div class="profile-card-title">Alergias</div>
          <div class="profile-tag-list" id="tag-alergias">
            ${alergias.map(a => `<span class="profile-tag" style="background:#fef2f2;color:#991b1b">${a}<button class="profile-tag-remove" onclick="removeTag('alergias','${a}')">×</button></span>`).join("")}
          </div>
          <div class="tag-input-row">
            <input class="field-input" id="input-alergia" placeholder="Ej: Penicilina" style="font-size:12px">
            <button class="btn-add-tag" onclick="addTag('alergias')">+ Agregar</button>
          </div>
        </div>

        <div class="profile-card">
          <div class="profile-card-title">Medicación crónica</div>
          <div class="profile-tag-list" id="tag-medicacion">
            ${medicacion.map(m => `<span class="profile-tag" style="background:#eff4ff;color:#1d4ed8">${m}<button class="profile-tag-remove" onclick="removeTag('medicacion','${m}')">×</button></span>`).join("")}
          </div>
          <div class="tag-input-row">
            <input class="field-input" id="input-medicacion" placeholder="Ej: Enalapril 10mg" style="font-size:12px">
            <button class="btn-add-tag" onclick="addTag('medicacion')">+ Agregar</button>
          </div>
        </div>
      </div>

      <div class="profile-card" style="margin-bottom:14px">
        <div class="profile-card-title">Antecedentes médicos</div>
        <div class="profile-tag-list" id="tag-antecedentes">
          ${antecedentes.map(a => `<span class="profile-tag">${a}<button class="profile-tag-remove" onclick="removeTag('antecedentes','${a}')">×</button></span>`).join("")}
        </div>
        <div class="tag-input-row">
          <input class="field-input" id="input-antecedente" placeholder="Ej: Hipertensión, Diabetes tipo 2" style="font-size:12px">
          <button class="btn-add-tag" onclick="addTag('antecedentes')">+ Agregar</button>
        </div>
      </div>

      <div class="profile-card" style="margin-bottom:16px">
        <div class="profile-card-title">Notas adicionales</div>
        <textarea class="field-textarea" id="p-notas" placeholder="Cualquier info relevante para tu médico..." style="min-height:80px">${profile.notas||""}</textarea>
      </div>

      <button class="btn-save-profile" onclick="window._saveProfileData()">Guardar perfil</button>
    </div>
  `;

  // Store tags in memory for editing
  window._profileTags = { alergias: [...alergias], medicacion: [...medicacion], antecedentes: [...antecedentes] };
}

window._saveProfileData = async () => {
  const btn = document.querySelector(".btn-save-profile");
  btn.textContent = "Guardando...";
  btn.disabled = true;
  try {
    await saveProfile({
      sangre: document.getElementById("p-sangre")?.value || "",
      rh: document.getElementById("p-rh")?.value || "",
      contacto: document.getElementById("p-contacto")?.value || "",
      cobertura: document.getElementById("p-cobertura")?.value || "",
      notas: document.getElementById("p-notas")?.value || "",
      alergias: window._profileTags.alergias,
      medicacion: window._profileTags.medicacion,
      antecedentes: window._profileTags.antecedentes,
    });
    toast("Perfil guardado ✓");
  } catch(e) {
    toast("Error al guardar. Intentá de nuevo.");
  }
  btn.textContent = "Guardar perfil";
  btn.disabled = false;
};

window.addTag = (type) => {
  const inputId = { alergias: "input-alergia", medicacion: "input-medicacion", antecedentes: "input-antecedente" }[type];
  const val = document.getElementById(inputId)?.value?.trim();
  if (!val) return;
  if (!window._profileTags[type].includes(val)) {
    window._profileTags[type].push(val);
    refreshTags(type);
  }
  document.getElementById(inputId).value = "";
};

window.removeTag = (type, val) => {
  window._profileTags[type] = window._profileTags[type].filter(t => t !== val);
  refreshTags(type);
};

function refreshTags(type) {
  const colors = { alergias: "background:#fef2f2;color:#991b1b", medicacion: "background:#eff4ff;color:#1d4ed8", antecedentes: "" };
  const el = document.getElementById(`tag-${type}`);
  if (!el) return;
  el.innerHTML = window._profileTags[type].map(t =>
    `<span class="profile-tag" style="${colors[type]}">${t}<button class="profile-tag-remove" onclick="removeTag('${type}','${t}')">×</button></span>`
  ).join("");
}

// ── RESUMEN DE SALUD GENERAL ──────────────────
async function renderResumenSalud() {
  const content = document.getElementById("content-area");
  content.innerHTML = `
    <div style="max-width:600px">
      <div class="ai-summary-box" id="resumen-box">
        <div class="ai-summary-label">✦ Analizando tu historial completo...</div>
        <div class="ai-loading">
          <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
          <span style="margin-left:8px">Esto puede tardar unos segundos</span>
        </div>
      </div>
    </div>
  `;

  try {
    const [studies, profile] = await Promise.all([getStudies(), loadProfile()]);

    if (studies.length === 0) {
      document.getElementById("resumen-box").innerHTML = `
        <div class="ai-summary-label">✦ Resumen de salud</div>
        <div class="ai-summary-text">Todavía no tenés estudios cargados. Subí tus estudios para que la IA pueda analizarlos.</div>
      `;
      return;
    }

    const estudiosTexto = studies.map(s =>
      `- ${s.type}: ${s.title} (${s.date || "sin fecha"}) en ${s.institution || "institución no especificada"}${s.aiSummary ? ". Resumen: " + s.aiSummary : ""}${s.notes ? ". Notas: " + s.notes : ""}`
    ).join("\n");

    const perfilTexto = profile ? `
Grupo sanguíneo: ${profile.sangre || "no especificado"}
Alergias: ${profile.alergias?.join(", ") || "ninguna registrada"}
Medicación crónica: ${profile.medicacion?.join(", ") || "ninguna registrada"}
Antecedentes: ${profile.antecedentes?.join(", ") || "ninguno registrado"}
Cobertura médica: ${profile.cobertura || "no especificada"}
    `.trim() : "";

    const system = `Sos un asistente médico que ayuda a pacientes argentinos a entender su historial de salud. Usá español rioplatense (vos). Sé claro, empático y tranquilizador. Nunca alarmés. Siempre recordá que el médico es quien interpreta definitivamente. Organizá tu respuesta en secciones claras usando emojis como íconos.`;

    const msg = `Analizá el siguiente historial médico completo del paciente y hacé un resumen general de su estado de salud. Identificá patrones, valores que se repiten, estudios pendientes o recomendaciones generales. Sé conciso pero completo.

PERFIL DEL PACIENTE:
${perfilTexto || "Sin datos de perfil cargados"}

ESTUDIOS REALIZADOS (${studies.length} en total):
${estudiosTexto}

Organizá tu respuesta así:
1. Resumen general (2-3 oraciones)
2. Puntos a tener en cuenta
3. Recomendaciones generales
4. Recordatorio: esto no reemplaza la consulta médica`;

    const summary = await callAI(system, msg);

    // Format the response nicely
    const formatted = summary
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p style="margin-top:10px">')
      .replace(/\n/g, '<br>');

    document.getElementById("resumen-box").innerHTML = `
      <div class="ai-summary-label">✦ Resumen de salud general · ${studies.length} estudio${studies.length !== 1 ? "s" : ""} analizados</div>
      <div class="ai-summary-text"><p>${formatted}</p></div>
    `;

    // Add regenerate button
    const container = document.querySelector("#content-area > div");
    container.innerHTML += `
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn-outline" onclick="renderResumenSalud()" style="font-size:12px">↺ Regenerar análisis</button>
        <button class="btn-outline" onclick="window._shareResumen()" style="font-size:12px">↗ Compartir con médico</button>
      </div>
      <div style="margin-top:16px;background:var(--bg2);border-radius:var(--radius);padding:14px">
        <div style="font-size:11px;font-weight:500;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Preguntarle algo a la IA</div>
        <div style="display:flex;gap:8px">
          <input class="ask-input" id="resumen-question" placeholder="Ej: ¿Qué estudios me convendría hacer próximamente?">
          <button class="btn-ask" onclick="window._askResumen()">→</button>
        </div>
        <div id="resumen-answer" style="margin-top:10px;font-size:13px;line-height:1.65;display:none;background:var(--surface);border-radius:var(--radius);padding:12px"></div>
      </div>
    `;

  } catch(e) {
    document.getElementById("resumen-box").innerHTML = `
      <div class="ai-summary-label">✦ Resumen de salud</div>
      <div class="ai-summary-text" style="color:var(--text3)">No se pudo conectar con la IA. Intentá de nuevo.</div>
    `;
  }
}

window._askResumen = async () => {
  const q = document.getElementById("resumen-question")?.value?.trim();
  const answerEl = document.getElementById("resumen-answer");
  if (!q || !answerEl) return;
  answerEl.style.display = "block";
  answerEl.innerHTML = `<div class="ai-loading"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><span style="margin-left:8px;color:var(--text3)">Pensando...</span></div>`;
  try {
    const studies = await getStudies();
    const profile = await loadProfile();
    const system = `Sos un asistente médico para pacientes argentinos. Respondé en español rioplatense (vos), de forma clara y simple. Siempre recomendá consultar al médico.`;
    const msg = `El paciente tiene ${studies.length} estudios registrados. Alergias: ${profile.alergias?.join(", ") || "ninguna"}. Medicación: ${profile.medicacion?.join(", ") || "ninguna"}.\n\nPregunta: ${q}`;
    const answer = await callAI(system, msg);
    answerEl.textContent = answer;
  } catch(e) {
    answerEl.textContent = "Error de conexión. Intentá de nuevo.";
  }
};

window._shareResumen = () => {
  toast("Para compartir el resumen, sacá una captura de pantalla y enviásela al médico.");
};
