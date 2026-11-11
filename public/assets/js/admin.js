// Painel administrativo — Firebase Auth + leitura do Firestore (protegida pelas regras)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, signOut, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, query, where, orderBy, getDocs, doc, setDoc, deleteDoc, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { apiGet, apiPost } from "./api.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FUSO = "America/Sao_Paulo";
const hoje = (d = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(Date.now() + d * 864e5));
const br = (iso) => (iso ? iso.split("-").reverse().join("/") : "–");
const fone = (c) => (c?.length === 11 ? `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}` : c?.length === 10 ? `(${c.slice(0, 2)}) ${c.slice(2, 6)}-${c.slice(6)}` : c || "");
const dataTs = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString("pt-BR") : "–");
const STATUS_LABEL = { confirmado: "Confirmado", concluido: "Concluído", cancelado: "Cancelado", faltou: "Faltou" };

let agendamentos = [];
let clientes = [];

// ---------------- Autenticação ----------------
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3500);
}

const MSG_ERRO = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
  "auth/popup-closed-by-user": "Login cancelado.",
  "auth/invalid-email": "E-mail inválido.",
};

$("#formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginErro").textContent = "";
  $("#btnEntrar").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginSenha").value);
  } catch (err) {
    $("#loginErro").textContent = MSG_ERRO[err.code] || "Não foi possível entrar.";
  } finally {
    $("#btnEntrar").disabled = false;
  }
});

$("#btnGoogle").addEventListener("click", async () => {
  $("#loginErro").textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    $("#loginErro").textContent = MSG_ERRO[err.code] || "Não foi possível entrar com Google.";
  }
});

$("#btnEsqueci").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  if (!email) return ($("#loginErro").textContent = "Digite seu e-mail acima e clique novamente.");
  try {
    await sendPasswordResetEmail(auth, email);
  } catch {}
  $("#loginErro").textContent = "Se o e-mail estiver cadastrado, você receberá o link de redefinição.";
});

$("#btnSair").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $("#telaPainel").hidden = true;
    $("#telaLogin").hidden = false;
    return;
  }
  const token = await user.getIdToken();
  const v = await apiPost("verificar", { idToken: token }).catch(() => null);
  if (!v || !v.admin) {
    await signOut(auth);
    $("#loginErro").textContent = v?.erro || `Não foi possível validar o acesso de ${user.email}.`;
    return;
  }
  $("#usuarioEmail").textContent = user.email;
  $("#telaLogin").hidden = true;
  $("#telaPainel").hidden = false;
  iniciarPainel();
});

// ---------------- Painel ----------------
let iniciado = false;
async function iniciarPainel() {
  if (!iniciado) {
    iniciado = true;
    $("#fIni").value = hoje();
    $("#fFim").value = hoje(30);
    $$(".aba").forEach((b) => b.addEventListener("click", () => trocarAba(b.dataset.aba)));
    $("#btnFiltrar").addEventListener("click", carregarAgendamentos);
    $("#fStatus").addEventListener("change", renderAgendamentos);
    $("#fBuscaAg").addEventListener("input", renderAgendamentos);
    $("#fBuscaCli").addEventListener("input", renderClientes);
    $("#btnCsvAg").addEventListener("click", () => csv("agendamentos", filtrarAgendamentos(), [
      ["data", "Data"], ["hora", "Hora"], ["nome", "Nome"], ["celular", "Celular"], ["email", "E-mail"],
      ["servicoNome", "Serviço"], ["status", "Status"], ["observacoes", "Observações"],
    ]));
    $("#btnCsvCli").addEventListener("click", () => csv("clientes", filtrarClientes(), [
      ["nome", "Nome"], ["celular", "Celular"], ["email", "E-mail"], ["totalAgendamentos", "Agendamentos"], ["ultimoAgendamento", "Último"],
    ]));
    $("#formAdmin").addEventListener("submit", adicionarAdmin);
    try {
      const cfg = await apiGet("config");
      $("#painelNome").textContent = cfg.nome;
    } catch {}
  }
  await Promise.all([carregarAgendamentos(), carregarClientes(), carregarAdmins(), carregarIndicadores()]);
}

function trocarAba(nome) {
  $$(".aba").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === nome));
  $$(".aba-conteudo").forEach((s) => (s.hidden = s.id !== `aba-${nome}`));
}

async function carregarIndicadores() {
  try {
    const ag = collection(db, "agendamentos");
    const [h, s, c] = await Promise.all([
      getDocs(query(ag, where("data", "==", hoje()))),
      getDocs(query(ag, where("data", ">=", hoje()), where("data", "<=", hoje(7)))),
      getCountFromServer(collection(db, "clientes")),
    ]);
    const ativos = (snap) => snap.docs.filter((d) => d.data().status !== "cancelado").length;
    $("#kHoje").textContent = ativos(h);
    $("#k7").textContent = ativos(s);
    $("#kClientes").textContent = c.data().count;
  } catch (e) {
    console.error(e);
  }
}

async function carregarAgendamentos() {
  const tb = $("#tbAgendamentos");
  tb.innerHTML = `<tr><td colspan="7" class="vazio">Carregando…</td></tr>`;
  try {
    const q = query(
      collection(db, "agendamentos"),
      where("data", ">=", $("#fIni").value || hoje()),
      where("data", "<=", $("#fFim").value || hoje(30)),
      orderBy("data")
    );
    const snap = await getDocs(q);
    agendamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    $("#kCancel").textContent = agendamentos.filter((a) => a.status === "cancelado").length;
    renderAgendamentos();
  } catch (e) {
    console.error(e);
    tb.innerHTML = `<tr><td colspan="7" class="vazio">Erro ao carregar (${esc(e.code || e.message)}).</td></tr>`;
  }
}

function filtrarAgendamentos() {
  const st = $("#fStatus").value;
  const busca = $("#fBuscaAg").value.trim().toLowerCase();
  return agendamentos.filter(
    (a) => (!st || a.status === st) &&
      (!busca || `${a.nome} ${a.email} ${a.celular} ${a.servicoNome}`.toLowerCase().includes(busca))
  );
}

function renderAgendamentos() {
  const lista = filtrarAgendamentos();
  const tb = $("#tbAgendamentos");
  if (!lista.length) return (tb.innerHTML = `<tr><td colspan="7" class="vazio">Nenhum agendamento no período.</td></tr>`);
  tb.innerHTML = lista
    .map((a) => `
      <tr>
        <td>${br(a.data)}</td>
        <td>${esc(a.hora)}<small>até ${esc(a.horaFim || "")}</small></td>
        <td><strong>${esc(a.nome)}</strong>${a.observacoes ? `<small>${esc(a.observacoes)}</small>` : ""}</td>
        <td><a href="https://wa.me/55${esc(a.celular)}" target="_blank" rel="noopener">${esc(fone(a.celular))}</a><small>${esc(a.email)}</small></td>
        <td>${esc(a.servicoNome)}</td>
        <td><span class="selo selo--${esc(a.status)}">${STATUS_LABEL[a.status] || esc(a.status)}</span>
          ${a.emailErro ? `<small title="${esc(a.emailErro)}">⚠ e-mail não enviado</small>` : ""}</td>
        <td><div class="acoes">
          ${a.status === "confirmado" ? `
            <button class="btn btn--claro btn--mini" data-acao="concluido" data-id="${a.id}">Concluir</button>
            <button class="btn btn--claro btn--mini" data-acao="faltou" data-id="${a.id}">Faltou</button>
            <button class="btn btn--claro btn--mini" data-acao="cancelado" data-id="${a.id}">Cancelar</button>` : ""}
        </div></td>
      </tr>`)
    .join("");
  tb.querySelectorAll("[data-acao]").forEach((b) => b.addEventListener("click", () => mudarStatus(b.dataset.id, b.dataset.acao)));
}

async function mudarStatus(id, status) {
  let avisarCliente = false;
  if (status === "cancelado") {
    if (!confirm("Cancelar este agendamento? O horário será liberado e removido do Google Agenda.")) return;
    avisarCliente = confirm("Enviar e-mail avisando a cliente sobre o cancelamento?");
  }
  const token = await auth.currentUser.getIdToken();
  const j = await apiPost("status", { idToken: token, id, status, avisarCliente }).catch(() => ({ erro: "Erro de conexão." }));
  if (j.erro || !j.ok) return toast(j.erro || "Erro ao atualizar.");
  toast("Status atualizado.");
  await Promise.all([carregarAgendamentos(), carregarIndicadores()]);
}

async function carregarClientes() {
  const tb = $("#tbClientes");
  try {
    const snap = await getDocs(query(collection(db, "clientes"), orderBy("nome")));
    clientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderClientes();
  } catch (e) {
    console.error(e);
    tb.innerHTML = `<tr><td colspan="6" class="vazio">Erro ao carregar (${esc(e.code || e.message)}).</td></tr>`;
  }
}

function filtrarClientes() {
  const b = $("#fBuscaCli").value.trim().toLowerCase();
  const dig = b.replace(/\D/g, "");
  return clientes.filter((c) => !b || `${c.nome} ${c.email}`.toLowerCase().includes(b) || (dig && c.celular?.includes(dig)));
}

function renderClientes() {
  const lista = filtrarClientes();
  const tb = $("#tbClientes");
  if (!lista.length) return (tb.innerHTML = `<tr><td colspan="6" class="vazio">Nenhum cliente encontrado.</td></tr>`);
  tb.innerHTML = lista
    .map((c) => `
      <tr>
        <td><strong>${esc(c.nome)}</strong></td>
        <td><a href="https://wa.me/55${esc(c.celular)}" target="_blank" rel="noopener">${esc(fone(c.celular))}</a></td>
        <td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
        <td>${c.totalAgendamentos || 0}</td>
        <td>${br(c.ultimoAgendamento)}</td>
        <td>${dataTs(c.criadoEm)}</td>
      </tr>`)
    .join("");
}

async function carregarAdmins() {
  const ul = $("#listaAdmins");
  try {
    const snap = await getDocs(collection(db, "admins"));
    const meu = auth.currentUser.email.toLowerCase();
    ul.innerHTML = snap.docs
      .map((d) => `<li><span>${esc(d.id)}${d.id === meu ? " <small>(você)</small>" : ""}</span>
        ${d.id !== meu && d.data().origem !== "ADMIN_EMAILS" ? `<button class="btn btn--claro btn--mini" data-remover="${esc(d.id)}">Remover</button>` : ""}</li>`)
      .join("");
    ul.querySelectorAll("[data-remover]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm(`Remover acesso de ${b.dataset.remover}?`)) return;
        await deleteDoc(doc(db, "admins", b.dataset.remover));
        toast("Acesso removido.");
        carregarAdmins();
      })
    );
  } catch (e) {
    ul.innerHTML = `<li>Erro ao carregar (${esc(e.code || e.message)}).</li>`;
  }
}

async function adicionarAdmin(e) {
  e.preventDefault();
  const email = $("#novoAdmin").value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return toast("E-mail inválido.");
  try {
    await setDoc(doc(db, "admins", email), { email, adicionadoPor: auth.currentUser.email, origem: "painel" });
    $("#novoAdmin").value = "";
    toast("E-mail autorizado.");
    carregarAdmins();
  } catch (err) {
    toast("Não foi possível autorizar: " + (err.code || err.message));
  }
}

function csv(nome, linhas, colunas) {
  const cab = colunas.map((c) => c[1]).join(";");
  const corpo = linhas.map((l) => colunas.map(([k]) => `"${String(l[k] ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + cab + "\n" + corpo], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${nome}-${hoje()}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}
