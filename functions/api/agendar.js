// POST /api/agendar — cria o agendamento, cadastra/atualiza a cliente,
// lança no Google Calendar e envia o e-mail de confirmação.
import { getServico, SALAO } from "../lib/config.js";
import { db, FieldValue } from "../lib/firebase.js";
import { criarEvento } from "../lib/calendar.js";
import { enviarConfirmacao } from "../lib/email.js";
import {
  dataValida, slotsDoDia, toMs, isoComFuso, addMinutos, conflita, ocupadosDoDia,
} from "../lib/agenda.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const limpa = (v, max = 200) => String(v ?? "").trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // Honeypot anti-robô: campo invisível que humanos não preenchem
  if (body.site) return res.status(200).json({ ok: true });

  const nome = limpa(body.nome, 120);
  const email = limpa(body.email, 160).toLowerCase();
  const celular = limpa(body.celular, 20).replace(/\D/g, "");
  const servicoId = limpa(body.servico, 40);
  const data = limpa(body.data, 10);
  const hora = limpa(body.hora, 5);
  const observacoes = limpa(body.observacoes, 500);
  const aceiteLGPD = body.aceite === true;

  // ---- Campos obrigatórios ----
  const erros = [];
  if (nome.length < 3) erros.push("Informe seu nome completo.");
  if (!/^\d{10,11}$/.test(celular)) erros.push("Informe um celular válido com DDD.");
  if (!EMAIL_RE.test(email)) erros.push("Informe um e-mail válido.");
  const servico = getServico(servicoId);
  if (!servico) erros.push("Escolha um serviço.");
  if (!dataValida(data)) erros.push("Escolha uma data válida.");
  if (!/^\d{2}:\d{2}$/.test(hora)) erros.push("Escolha um horário.");
  if (!aceiteLGPD) erros.push("É preciso aceitar o uso dos dados para o agendamento.");
  if (erros.length) return res.status(400).json({ erro: erros.join(" ") });

  if (!slotsDoDia(data, servico.duracao).includes(hora))
    return res.status(400).json({ erro: "Horário fora do funcionamento do salão." });

  const inicio = toMs(data, hora);
  const fim = inicio + servico.duracao * 60e3;
  if (inicio < Date.now() + SALAO.antecedenciaMin * 60e3)
    return res.status(400).json({ erro: "Esse horário já não está mais disponível." });

  try {
    // Checagem prévia (inclui bloqueios do Google Calendar)
    const ocupados = await ocupadosDoDia(data);
    if (conflita(inicio, fim, ocupados))
      return res.status(409).json({ erro: "Ops! Esse horário acabou de ser ocupado. Escolha outro." });

    const clienteRef = db.collection("clientes").doc(email);
    const agRef = db.collection("agendamentos").doc();

    const agendamento = {
      nome, email, celular,
      servicoId: servico.id, servicoNome: servico.nome, duracao: servico.duracao,
      data, hora, horaFim: addMinutos(data, hora, servico.duracao),
      inicioISO: isoComFuso(data, hora),
      fimISO: isoComFuso(data, addMinutos(data, hora, servico.duracao)),
      observacoes, status: "confirmado", origem: "site",
      criadoEm: FieldValue.serverTimestamp(),
    };

    // Transação: garante que dois clientes não peguem o mesmo horário ao mesmo tempo
    await db.runTransaction(async (t) => {
      const q = db.collection("agendamentos").where("data", "==", data);
      const snap = await t.get(q);
      const ativos = snap.docs.map((d) => d.data()).filter((a) => a.status !== "cancelado")
        .map((a) => ({ inicio: toMs(a.data, a.hora), fim: toMs(a.data, a.hora) + a.duracao * 60e3 }));
      if (conflita(inicio, fim, ativos)) throw Object.assign(new Error("conflito"), { code: "CONFLITO" });

      const cliente = await t.get(clienteRef);
      t.set(agRef, agendamento);
      t.set(clienteRef, {
        nome, email, celular,
        aceiteLGPD: true,
        ultimoAgendamento: data,
        totalAgendamentos: FieldValue.increment(1),
        atualizadoEm: FieldValue.serverTimestamp(),
        ...(cliente.exists ? {} : { criadoEm: FieldValue.serverTimestamp() }),
      }, { merge: true });
    });

    const ag = { id: agRef.id, ...agendamento };

    // Google Calendar (não bloqueia o agendamento se falhar)
    try {
      const eventId = await criarEvento({
        titulo: `${servico.nome} — ${nome}`,
        descricao: `Cliente: ${nome}\nCelular: ${celular}\nE-mail: ${email}\nObservações: ${observacoes || "-"}\nID: ${agRef.id}`,
        inicioISO: ag.inicioISO, fimISO: ag.fimISO,
      });
      if (eventId) await agRef.update({ calendarEventId: eventId });
    } catch (e) {
      console.error("Erro no Google Calendar:", e.message);
      await agRef.update({ calendarErro: e.message.slice(0, 300) });
    }

    // E-mail de confirmação
    let emailEnviado = true;
    try {
      await enviarConfirmacao(ag);
      await agRef.update({ emailConfirmacaoEm: FieldValue.serverTimestamp() });
    } catch (e) {
      emailEnviado = false;
      console.error("Erro ao enviar e-mail:", e.message);
      await agRef.update({ emailErro: e.message.slice(0, 300) });
    }

    return res.status(201).json({
      ok: true, id: agRef.id, emailEnviado,
      resumo: { servico: servico.nome, data, hora, nome },
    });
  } catch (e) {
    if (e.code === "CONFLITO")
      return res.status(409).json({ erro: "Ops! Esse horário acabou de ser ocupado. Escolha outro." });
    console.error(e);
    return res.status(500).json({ erro: "Não foi possível concluir o agendamento. Tente novamente ou chame no WhatsApp." });
  }
}
