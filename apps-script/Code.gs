/**
 * =====================================================================
 *  SITE SALÃO MODELO — Back-end em Google Apps Script (gratuito)
 * =====================================================================
 *  O que este script faz:
 *   • ?acao=config      → dados públicos do salão (usados pelo site)
 *   • ?acao=horarios    → horários livres (lê o Google Agenda do salão)
 *   • POST agendar      → cria o evento na agenda + grava cliente e agendamento no Firestore
 *   • POST verificar    → confirma se o login do painel é de administrador
 *   • POST status       → painel altera status (cancelar remove o evento da agenda)
 *
 *  Propriedades do script (Configurações do projeto → Propriedades do script):
 *   FIREBASE_PROJECT_ID    ex.: siteestetic
 *   FIREBASE_WEB_API_KEY   apiKey do firebaseConfig (para validar o login do painel)
 *   CALENDAR_ID            ID da agenda do salão (vazio = agenda principal da conta)
 *   ADMIN_EMAILS           e-mails do painel, separados por vírgula
 *   CONVIDAR_CLIENTE       "sim" para a cliente receber convite do Google Agenda (opcional)
 *
 *  Publicar: Implantar → Nova implantação → App da Web
 *            Executar como: EU   |   Quem pode acessar: QUALQUER PESSOA
 * =====================================================================
 */

// ======================= CONFIGURAÇÃO DO SALÃO =======================
// Edite aqui para cada cliente (nome, contatos, serviços e horários).
var SALAO = {
  nome: "Atelier Canela",
  slogan: "Beleza & Estética",
  descricao:
    "Um espaço acolhedor para cuidar de você: cabelo, unhas, sobrancelhas e estética com profissionais experientes e produtos de qualidade.",
  endereco: "Rua Exemplo, 123 — Centro, Duque de Caxias - RJ",
  mapsUrl: "https://maps.google.com/?q=Duque+de+Caxias+RJ",

  contato: {
    whatsapp: "5521999999999", // DDI + DDD + número, só dígitos
    telefoneExibicao: "(21) 99999-9999",
    email: "contato@ateliercanela.com.br",
  },

  redes: {
    instagram: "https://instagram.com/ateliercanela",
    facebook: "https://facebook.com/ateliercanela",
    tiktok: "https://tiktok.com/@ateliercanela",
  },

  fuso: "America/Sao_Paulo",
  offset: "-03:00",       // Brasil sem horário de verão desde 2019
  intervaloMin: 30,       // intervalo entre horários oferecidos
  antecedenciaMin: 120,   // antecedência mínima para agendar (minutos)
  diasMaximos: 60,        // até quantos dias à frente pode agendar

  // 0 = domingo ... 6 = sábado  |  null = fechado
  funcionamento: {
    0: null,
    1: null,
    2: { abre: "09:00", fecha: "19:00" },
    3: { abre: "09:00", fecha: "19:00" },
    4: { abre: "09:00", fecha: "19:00" },
    5: { abre: "09:00", fecha: "20:00" },
    6: { abre: "08:00", fecha: "17:00" },
  },

  servicos: [
    { id: "corte", nome: "Corte feminino", duracao: 60, preco: "a partir de R$ 70" },
    { id: "escova", nome: "Escova modelada", duracao: 45, preco: "a partir de R$ 50" },
    { id: "coloracao", nome: "Coloração", duracao: 120, preco: "a partir de R$ 150" },
    { id: "mechas", nome: "Mechas / Luzes", duracao: 180, preco: "a partir de R$ 280" },
    { id: "hidratacao", nome: "Hidratação profunda", duracao: 60, preco: "a partir de R$ 80" },
    { id: "manicure", nome: "Manicure & Pedicure", duracao: 60, preco: "a partir de R$ 55" },
    { id: "sobrancelha", nome: "Design de sobrancelha", duracao: 30, preco: "a partir de R$ 35" },
    { id: "maquiagem", nome: "Maquiagem social", duracao: 60, preco: "a partir de R$ 120" },
  ],
};

// ============================ ROTEAMENTO =============================
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    switch (p.acao) {
      case "config": return json_(SALAO);
      case "horarios": return json_(horarios_(p.data, p.servico));
      case "ping": return json_({ ok: true });
      default: return json_({ erro: "Ação inválida." });
    }
  } catch (err) {
    return erro_(err);
  }
}

function doPost(e) {
  var b;
  try {
    b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (_) {
    return json_({ erro: "Requisição inválida." });
  }
  try {
    switch (b.acao) {
      case "agendar": return json_(agendar_(b));
      case "verificar": return json_(verificar_(b.idToken));
      case "status": return json_(alterarStatus_(b));
      default: return json_({ erro: "Ação inválida." });
    }
  } catch (err) {
    return erro_(err);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function erro_(err) {
  if (err && err.publico) return json_({ erro: err.message, codigo: err.codigo || 400 });
  console.error(err && err.stack ? err.stack : err);
  return json_({ erro: "Não foi possível concluir agora. Tente novamente ou chame no WhatsApp.", codigo: 500 });
}
function falha_(msg, codigo) {
  var e = new Error(msg);
  e.publico = true;
  e.codigo = codigo || 400;
  return e;
}
function props_() {
  return PropertiesService.getScriptProperties().getProperties();
}

// ======================== HORÁRIOS / AGENDA ==========================
function pad_(n) { return (n < 10 ? "0" : "") + n; }
function hm_(h) { var p = h.split(":"); return Number(p[0]) * 60 + Number(p[1]); }
function mh_(m) { return pad_(Math.floor(m / 60)) + ":" + pad_(m % 60); }
function dataHora_(data, hora) { return new Date(data + "T" + hora + ":00" + SALAO.offset); }
function diaSemana_(data) { return dataHora_(data, "12:00").getUTCDay(); }
function servico_(id) {
  for (var i = 0; i < SALAO.servicos.length; i++) if (SALAO.servicos[i].id === id) return SALAO.servicos[i];
  return null;
}

function dataValida_(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "")) return false;
  var t = dataHora_(data, "12:00").getTime();
  if (isNaN(t)) return false;
  var agora = Date.now();
  return t > agora - 24 * 3600e3 && t < agora + SALAO.diasMaximos * 24 * 3600e3;
}

function slotsDoDia_(data, duracao) {
  var f = SALAO.funcionamento[diaSemana_(data)];
  if (!f) return [];
  var out = [];
  for (var m = hm_(f.abre); m + duracao <= hm_(f.fecha); m += SALAO.intervaloMin) out.push(mh_(m));
  return out;
}

function agenda_() {
  var id = props_().CALENDAR_ID;
  var cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error("Agenda não encontrada. Confira CALENDAR_ID e o compartilhamento.");
  return cal;
}

// Intervalos ocupados no dia (qualquer evento da agenda bloqueia; evento de dia inteiro bloqueia o dia)
function ocupados_(data) {
  var ini = dataHora_(data, "00:00");
  var fim = dataHora_(data, "23:59");
  var eventos = agenda_().getEvents(ini, fim);
  var out = [];
  for (var i = 0; i < eventos.length; i++) {
    var ev = eventos[i];
    if (ev.isAllDayEvent()) out.push([ini.getTime(), fim.getTime() + 60e3]);
    else out.push([ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
  }
  return out;
}

function livres_(data, duracao) {
  var oc = ocupados_(data);
  var limite = Date.now() + SALAO.antecedenciaMin * 60e3;
  return slotsDoDia_(data, duracao).filter(function (h) {
    var a = dataHora_(data, h).getTime();
    var b = a + duracao * 60e3;
    if (a < limite) return false;
    for (var i = 0; i < oc.length; i++) if (a < oc[i][1] && b > oc[i][0]) return false;
    return true;
  });
}

function horarios_(data, servicoId) {
  var s = servico_(servicoId);
  if (!s) throw falha_("Serviço inválido.");
  if (!dataValida_(data)) throw falha_("Data inválida.");
  if (slotsDoDia_(data, s.duracao).length === 0) return { fechado: true, horarios: [] };
  return { fechado: false, horarios: livres_(data, s.duracao) };
}

// ============================ AGENDAR ================================
function agendar_(b) {
  if (b.site) return { ok: true }; // honeypot anti-robô

  var limpa = function (v, max) { return String(v == null ? "" : v).trim().slice(0, max || 200); };
  var nome = limpa(b.nome, 120);
  var email = limpa(b.email, 160).toLowerCase();
  var celular = limpa(b.celular, 20).replace(/\D/g, "");
  var data = limpa(b.data, 10);
  var hora = limpa(b.hora, 5);
  var observacoes = limpa(b.observacoes, 500);
  var s = servico_(limpa(b.servico, 40));

  var erros = [];
  if (nome.length < 3) erros.push("Informe seu nome completo.");
  if (!/^\d{10,11}$/.test(celular)) erros.push("Informe um celular válido com DDD.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.push("Informe um e-mail válido.");
  if (!s) erros.push("Escolha um serviço.");
  if (!dataValida_(data)) erros.push("Escolha uma data válida.");
  if (!/^\d{2}:\d{2}$/.test(hora)) erros.push("Escolha um horário.");
  if (b.aceite !== true) erros.push("É preciso aceitar o uso dos dados para o agendamento.");
  if (erros.length) throw falha_(erros.join(" "));
  if (slotsDoDia_(data, s.duracao).indexOf(hora) < 0) throw falha_("Horário fora do funcionamento do salão.");

  // Trava: impede dois agendamentos simultâneos no mesmo horário
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw falha_("Muitos agendamentos ao mesmo tempo. Tente de novo em instantes.", 503);
  try {
    if (livres_(data, s.duracao).indexOf(hora) < 0)
      throw falha_("Ops! Esse horário acabou de ser ocupado. Escolha outro.", 409);

    var inicio = dataHora_(data, hora);
    var fim = new Date(inicio.getTime() + s.duracao * 60e3);
    var id = Utilities.getUuid().replace(/-/g, "").slice(0, 20);
    var horaFim = mh_(hm_(hora) + s.duracao);

    var opcoes = {
      description:
        "Cliente: " + nome + "\nCelular: " + celular + "\nE-mail: " + email +
        "\nObservações: " + (observacoes || "-") + "\nID: " + id + "\n(agendado pelo site)",
    };
    if (String(props_().CONVIDAR_CLIENTE || "").toLowerCase() === "sim") {
      opcoes.guests = email;
      opcoes.sendInvites = true;
    }
    var evento = agenda_().createEvent(s.nome + " — " + nome, inicio, fim, opcoes);
    try { evento.setColor("6"); } catch (_) {}

    try {
      salvarAgendamento_({
        id: id, nome: nome, email: email, celular: celular,
        servicoId: s.id, servicoNome: s.nome, duracao: s.duracao,
        data: data, hora: hora, horaFim: horaFim,
        inicioISO: data + "T" + hora + ":00" + SALAO.offset,
        fimISO: data + "T" + horaFim + ":00" + SALAO.offset,
        observacoes: observacoes, status: "confirmado", origem: "site",
        calendarEventId: evento.getId(),
      });
    } catch (errBanco) {
      try { evento.deleteEvent(); } catch (_) {}
      throw errBanco;
    }

    return {
      ok: true, id: id,
      resumo: { servico: s.nome, data: data, hora: hora, horaFim: horaFim, nome: nome },
      linkAgenda: linkGoogleAgenda_(s.nome, inicio, fim),
    };
  } finally {
    lock.releaseLock();
  }
}

function linkGoogleAgenda_(servico, inicio, fim) {
  var f = function (d) { return Utilities.formatDate(d, "UTC", "yyyyMMdd'T'HHmmss'Z'"); };
  return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(servico + " — " + SALAO.nome) +
    "&dates=" + f(inicio) + "/" + f(fim) +
    "&location=" + encodeURIComponent(SALAO.endereco) +
    "&details=" + encodeURIComponent("Agendamento no " + SALAO.nome + ". Dúvidas: WhatsApp " + SALAO.contato.telefoneExibicao);
}

function salvarAgendamento_(ag) {
  var clienteExiste = fsGet_("clientes/" + ag.email) !== null;
  var campos = {};
  for (var k in ag) if (k !== "id") campos[k] = ag[k];

  var transformCliente = [
    { fieldPath: "totalAgendamentos", increment: { integerValue: "1" } },
    { fieldPath: "atualizadoEm", setToServerValue: "REQUEST_TIME" },
  ];
  if (!clienteExiste) transformCliente.push({ fieldPath: "criadoEm", setToServerValue: "REQUEST_TIME" });

  fsCommit_([
    {
      update: { name: fsNome_("agendamentos/" + ag.id), fields: fsCampos_(campos) },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: "criadoEm", setToServerValue: "REQUEST_TIME" }],
    },
    {
      update: {
        name: fsNome_("clientes/" + ag.email),
        fields: fsCampos_({ nome: ag.nome, email: ag.email, celular: ag.celular, aceiteLGPD: true, ultimoAgendamento: ag.data }),
      },
      updateMask: { fieldPaths: ["nome", "email", "celular", "aceiteLGPD", "ultimoAgendamento"] },
      updateTransforms: transformCliente,
    },
  ]);
}

// ======================== PAINEL (ADMIN) =============================
// Valida o token do Firebase Auth enviado pelo painel e devolve o e-mail
function emailDoToken_(idToken) {
  if (!idToken) return null;
  var key = props_().FIREBASE_WEB_API_KEY;
  var r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(key), {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) return null;
  var users = JSON.parse(r.getContentText()).users || [];
  return users.length && users[0].email ? String(users[0].email).toLowerCase() : null;
}

function exigirAdmin_(idToken) {
  var email = emailDoToken_(idToken);
  if (!email) throw falha_("Sessão inválida. Entre novamente.", 401);
  var lista = String(props_().ADMIN_EMAILS || "").split(",")
    .map(function (e) { return e.trim().toLowerCase(); }).filter(String);
  if (lista.indexOf(email) >= 0) {
    // garante o doc em /admins para as regras do Firestore liberarem a leitura no painel
    fsCommit_([{
      update: { name: fsNome_("admins/" + email), fields: fsCampos_({ email: email, origem: "ADMIN_EMAILS" }) },
      updateMask: { fieldPaths: ["email", "origem"] },
    }]);
    return email;
  }
  if (fsGet_("admins/" + email) !== null) return email;
  throw falha_("O e-mail " + email + " não tem permissão de administrador.", 403);
}

function verificar_(idToken) {
  return { admin: true, email: exigirAdmin_(idToken) };
}

function alterarStatus_(b) {
  var admin = exigirAdmin_(b.idToken);
  var STATUS = ["confirmado", "concluido", "cancelado", "faltou"];
  if (!b.id || STATUS.indexOf(b.status) < 0) throw falha_("Dados inválidos.");
  var doc = fsGet_("agendamentos/" + b.id);
  if (!doc) throw falha_("Agendamento não encontrado.", 404);

  fsCommit_([{
    update: { name: fsNome_("agendamentos/" + b.id), fields: fsCampos_({ status: b.status, atualizadoPor: admin }) },
    updateMask: { fieldPaths: ["status", "atualizadoPor"] },
    updateTransforms: [{ fieldPath: "atualizadoEm", setToServerValue: "REQUEST_TIME" }],
  }]);

  if (b.status === "cancelado" && doc.status !== "cancelado" && doc.calendarEventId) {
    try {
      var ev = agenda_().getEventById(doc.calendarEventId);
      if (ev) ev.deleteEvent();
    } catch (e) { console.warn("Evento não removido: " + e); }
  }
  return { ok: true };
}

// ===================== FIRESTORE (API REST) ==========================
// Usa a própria conta que executa o script (dona do projeto Firebase): sem chave, sem cartão.
function fsBase_() {
  var pid = props_().FIREBASE_PROJECT_ID;
  if (!pid) throw new Error("Defina FIREBASE_PROJECT_ID nas propriedades do script.");
  return "projects/" + pid + "/databases/(default)/documents";
}
function fsNome_(caminho) { return fsBase_() + "/" + caminho; }

function fsCampos_(obj) {
  var f = {};
  for (var k in obj) {
    var v = obj[k];
    if (v === null || v === undefined) f[k] = { nullValue: null };
    else if (typeof v === "boolean") f[k] = { booleanValue: v };
    else if (typeof v === "number") f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else f[k] = { stringValue: String(v) };
  }
  return f;
}

function fsValor_(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  return null;
}

function fsGet_(caminho) {
  var partes = caminho.split("/").map(encodeURIComponent).join("/");
  var r = UrlFetchApp.fetch("https://firestore.googleapis.com/v1/" + fsBase_() + "/" + partes, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw new Error("Firestore GET " + r.getResponseCode() + ": " + r.getContentText());
  var campos = JSON.parse(r.getContentText()).fields || {};
  var out = {};
  for (var k in campos) out[k] = fsValor_(campos[k]);
  return out;
}

function fsCommit_(writes) {
  var r = UrlFetchApp.fetch("https://firestore.googleapis.com/v1/" + fsBase_() + ":commit", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ writes: writes }), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error("Firestore commit " + r.getResponseCode() + ": " + r.getContentText());
  return JSON.parse(r.getContentText());
}

// ===================== TESTE MANUAL NO EDITOR ========================
// Selecione "testarConfiguracao" e clique em Executar para autorizar e conferir tudo.
function testarConfiguracao() {
  var p = props_();
  console.log("Projeto Firebase: " + p.FIREBASE_PROJECT_ID);
  console.log("Agenda: " + agenda_().getName());
  fsGet_("admins/__teste__"); // lança erro se não tiver acesso ao Firestore
  console.log("Firestore acessível: sim");
  var prox = new Date(Date.now() + 2 * 864e5);
  var data = Utilities.formatDate(prox, SALAO.fuso, "yyyy-MM-dd");
  console.log("Horários livres em " + data + " (corte): " + JSON.stringify(horarios_(data, "corte")));
}
