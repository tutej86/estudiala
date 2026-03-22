// =============================================
//  ESTUDIALA — app.js
//  Firebase Auth + Firestore + Cloudinary + IA
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

const ANTHROPIC_KEY = "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";

// Cloudinary — cuenta gratuita sin tarjeta
// INSTRUCCIÓN: Reemplazá estos valores con los tuyos de cloudinary.com
const CLOUDINARY_CLOUD = "dfprnopjk";
const CLOUDINARY_PRESET = "estudiala";

// ── INIT ─────────────────────────────────────
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let currentUser = null;
let currentFilter = null;
let aiCache = {};
let currentStudyForShare = null;

// ── AUTH ──────────────────────────────────────
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
    if (section === "inicio") loadAndRenderInicio();
    else if (section === "estudios") loadAndRenderEstudios(filter);
    else if (section === "subir") renderSubir();
    closeSidebar();
  });
});

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

// ── CLOUDINARY UPLOAD ─────────────────────────
async function uploadToCloudinary(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        resolve({ url: res.secure_url, publicId: res.public_id, format: res.format });
      } else {
        reject(new Error("Error subiendo archivo"));
      }
    };
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.send(formData);
  });
}

// ── ANTHROPIC AI ──────────────────────────────
async function callAI(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "No se pudo generar respuesta.";
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

window._shareLink = (id) => {
  const link = `${window.location.origin}?compartir=${id}`;
  document.getElementById("link-copy-val").value = link;
  document.getElementById("link-copy-row").style.display = "flex";
};

window._copyLink = () => {
  const val = document.getElementById("link-copy-val").value;
  navigator.clipboard?.writeText(val);
  toast("Link copiado al portapapeles ✓");
};

window._shareWhatsApp = (id) => {
  const link = `${window.location.origin}?compartir=${id}`;
  const text = encodeURIComponent(`Te comparto un estudio médico desde Estudiala: ${link}`);
  window.open(`https://wa.me/?text=${text}`, "_blank");
};

window._shareEmail = (id) => {
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
    if (CLOUDINARY_CLOUD === "TU_CLOUD_NAME") {
      toast("Configurá Cloudinary para subir archivos (ver instrucciones)");
      btn.disabled = false;
      btn.textContent = "Guardar estudio";
      return;
    }
    try {
      const bar = document.getElementById("progress-bar");
      const fill = document.getElementById("progress-fill");
      if (bar) bar.style.display = "block";
      const result = await uploadToCloudinary(selectedFile, (pct) => {
        if (fill) fill.style.width = pct + "%";
      });
      fileUrl = result.url;
      filePublicId = result.publicId;
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
