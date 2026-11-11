// Front-end do site: carrega configuração, monta serviços e controla o agendamento.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

let SALAO = null;

init();

async function init() {
  $("#ano").textContent = new Date().getFullYear();
  menuMobile();
  try {
    SALAO = await fetch("/api/config").then((r) => r.json());
  } catch {
    console.error("Não foi possível carregar /api/config");
    return;
  }
  preencherDados();
  montarServicos();
  montarFuncionamento();
  configurarFormulario();
}

function menuMobile() {
  const btn = $("#menuBtn");
  const nav = $("#nav");
  btn.addEventListener("click", () => {
    const aberto = nav.classList.toggle("aberto");
    btn.setAttribute("aria-expanded", aberto);
  });
  $$("#nav a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("aberto")));
}

function preencherDados() {
  document.title = `${SALAO.nome} — ${SALAO.slogan}`;
  const mapa = {
    nome: SALAO.nome,
    slogan: SALAO.slogan,
    descricao: SALAO.descricao,
    telefone: SALAO.contato.telefoneExibicao,
    email: SALAO.contato.email,
    endereco: SALAO.endereco,
  };
  $$("[data-salao]").forEach((el) => (el.textContent = mapa[el.dataset.salao] ?? el.textContent));

  const msg = encodeURIComponent(`Olá! Vim pelo site do ${SALAO.nome} e gostaria de mais informações.`);
  const links = {
    whatsapp: `https://wa.me/${SALAO.contato.whatsapp}?text=${msg}`,
    email: `mailto:${SALAO.contato.email}`,
    instagram: SALAO.redes.instagram,
    facebook: SALAO.redes.facebook,
    tiktok: SALAO.redes.tiktok,
    maps: SALAO.mapsUrl,
  };
  $$("[data-link]").forEach((el) => {
    const url = links[el.dataset.link];
    if (url) el.href = url;
    else el.style.display = "none";
  });
}

function montarServicos() {
  const lista = $("#listaServicos");
  const select = $("#servico");
  lista.innerHTML = SALAO.servicos
    .map(
      (s) => `
      <article class="servico">
        <h3>${s.nome}</h3>
        <p class="servico__meta">Duração aprox. ${formatarDuracao(s.duracao)}</p>
        <p class="servico__preco">${s.preco}</p>
        <button class="servico__btn" data-servico="${s.id}">Agendar este serviço →</button>
      </article>`
    )
    .join("");
  select.insertAdjacentHTML(
    "beforeend",
    SALAO.servicos.map((s) => `<option value="${s.id}">${s.nome} · ${formatarDuracao(s.duracao)}</option>`).join("")
  );
  $$(".servico__btn").forEach((b) =>
    b.addEventListener("click", () => {
      select.value = b.dataset.servico;
      select.dispatchEvent(new Event("change"));
      $("#agendar").scrollIntoView({ behavior: "smooth" });
    })
  );
}

function montarFuncionamento() {
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  $("#funcionamento").innerHTML = ordem
    .map((d) => {
      const f = SALAO.funcionamento[d];
      return `<div class="${f ? "" : "fechado"}"><span>${DIAS[d]}</span><span>${f ? `${f.abre} – ${f.fecha}` : "Fechado"}</span></div>`;
    })
    .join("");
}

const formatarDuracao = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`);

function hojeISO(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: SALAO.fuso }).format(d); // YYYY-MM-DD
}

function configurarFormulario() {
  const form = $("#formAgendar");
  const data = $("#data");
  const servico = $("#servico");
  const celular = $("#celular");

  data.min = hojeISO();
  data.max = hojeISO(SALAO.diasMaximos);

  servico.addEventListener("change", carregarHorarios);
  data.addEventListener("change", carregarHorarios);

  // Máscara de celular (xx) xxxxx-xxxx
  celular.addEventListener("input", () => {
    const d = celular.value.replace(/\D/g, "").slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    celular.value = v;
  });

  form.addEventListener("submit", enviar);
  $("#novoAgendamento").addEventListener("click", () => {
    form.reset();
    $("#slots").innerHTML = "";
    $("#hora").value = "";
    $("#dicaHorario").textContent = "Escolha serviço e data";
    $("#sucesso").hidden = true;
    form.hidden = false;
  });
}

let reqId = 0;
async function carregarHorarios() {
  const servico = $("#servico").value;
  const data = $("#data").value;
  const slots = $("#slots");
  const dica = $("#dicaHorario");
  $("#hora").value = "";
  slots.innerHTML = "";
  if (!servico || !data) return (dica.textContent = "Escolha serviço e data");

  const dia = new Date(`${data}T12:00:00`).getDay();
  if (!SALAO.funcionamento[dia]) return (dica.textContent = `Fechado às ${DIAS[dia].toLowerCase()}s. Escolha outra data.`);

  dica.textContent = "Carregando horários…";
  const meu = ++reqId;
  try {
    const r = await fetch(`/api/horarios?data=${data}&servico=${servico}`);
    const json = await r.json();
    if (meu !== reqId) return;
    if (!r.ok) return (dica.textContent = json.erro || "Erro ao carregar horários.");
    if (json.fechado) return (dica.textContent = "Fechado nesta data.");
    if (!json.horarios.length) return (dica.textContent = "Sem horários livres nesta data. Tente outro dia.");
    dica.textContent = `${json.horarios.length} horários disponíveis`;
    slots.innerHTML = json.horarios
      .map((h) => `<button type="button" class="slot" role="option" aria-selected="false" data-hora="${h}">${h}</button>`)
      .join("");
    $$(".slot", slots).forEach((b) =>
      b.addEventListener("click", () => {
        $$(".slot", slots).forEach((x) => x.setAttribute("aria-selected", "false"));
        b.setAttribute("aria-selected", "true");
        $("#hora").value = b.dataset.hora;
      })
    );
  } catch {
    dica.textContent = "Erro de conexão ao carregar horários.";
  }
}

async function enviar(e) {
  e.preventDefault();
  const erro = $("#formErro");
  erro.textContent = "";
  $$(".invalido").forEach((el) => el.classList.remove("invalido"));

  const dados = {
    servico: $("#servico").value,
    data: $("#data").value,
    hora: $("#hora").value,
    nome: $("#nome").value.trim(),
    celular: $("#celular").value.replace(/\D/g, ""),
    email: $("#email").value.trim(),
    observacoes: $("#observacoes").value.trim(),
    aceite: $("#aceite").checked,
    site: $("[name=site]").value,
  };

  const problemas = [];
  if (!dados.servico) problemas.push(["#servico", "Escolha o serviço."]);
  if (!dados.data) problemas.push(["#data", "Escolha a data."]);
  if (!dados.hora) problemas.push([null, "Escolha um horário disponível."]);
  if (dados.nome.length < 3) problemas.push(["#nome", "Informe seu nome."]);
  if (!/^\d{10,11}$/.test(dados.celular)) problemas.push(["#celular", "Celular inválido."]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dados.email)) problemas.push(["#email", "E-mail inválido."]);
  if (!dados.aceite) problemas.push([null, "Marque a autorização de uso dos dados."]);
  if (problemas.length) {
    problemas.forEach(([sel]) => sel && $(sel).classList.add("invalido"));
    erro.textContent = problemas.map((p) => p[1]).join(" ");
    return;
  }

  const btn = $("#btnAgendar");
  btn.disabled = true;
  btn.textContent = "Confirmando…";
  try {
    const r = await fetch("/api/agendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await r.json();
    if (!r.ok) {
      erro.textContent = json.erro || "Não foi possível agendar.";
      if (r.status === 409) carregarHorarios();
      return;
    }
    const [a, m, d] = dados.data.split("-");
    $("#sucessoTexto").innerHTML = `<strong>${json.resumo.servico}</strong><br>${d}/${m}/${a} às <strong>${dados.hora}</strong><br><br>${
      json.emailEnviado
        ? `Enviamos a confirmação para <strong>${dados.email}</strong>. Confira também a caixa de spam.`
        : "Seu horário está garantido! Não conseguimos enviar o e-mail agora, mas o salão já recebeu seu agendamento."
    }`;
    $("#formAgendar").hidden = true;
    $("#sucesso").hidden = false;
    $("#agendar").scrollIntoView({ behavior: "smooth" });
  } catch {
    erro.textContent = "Erro de conexão. Tente novamente ou chame no WhatsApp.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar agendamento";
  }
}
