// Envio de e-mails (confirmação e cancelamento) via SMTP — padrão Gmail com senha de app.
import nodemailer from "nodemailer";
import { SALAO } from "./config.js";

let _t = null;
function transporte() {
  if (_t) return _t;
  _t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_PORT || 465) === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _t;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function dataBR(dataISO) {
  const [a, m, d] = dataISO.split("-");
  const dt = new Date(`${dataISO}T12:00:00${SALAO.offset}`);
  const dia = dt.toLocaleDateString("pt-BR", { weekday: "long", timeZone: SALAO.fuso });
  return `${dia}, ${d}/${m}/${a}`;
}

function toICSDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function gerarICS({ id, servico, inicioISO, fimISO }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SiteSalaoModelo//PT-BR",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${id}@sitesalaomodelo`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(inicioISO)}`,
    `DTEND:${toICSDate(fimISO)}`,
    `SUMMARY:${servico} — ${SALAO.nome}`,
    `LOCATION:${SALAO.endereco.replace(/,/g, "\\,")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function linkGoogleAgenda({ servico, inicioISO, fimISO }) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${servico} — ${SALAO.nome}`,
    dates: `${toICSDate(inicioISO)}/${toICSDate(fimISO)}`,
    location: SALAO.endereco,
    details: `Agendamento no ${SALAO.nome}. Dúvidas: WhatsApp ${SALAO.contato.telefoneExibicao}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function layout(titulo, corpo) {
  return `<!doctype html><html><body style="margin:0;background:#f5ede4;font-family:Georgia,'Times New Roman',serif;color:#3b2a20">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffaf5;border-radius:14px;overflow:hidden;border:1px solid #e3d3c3">
    <tr><td style="background:#4a2c1d;padding:28px;text-align:center;color:#f5e6d3">
      <div style="font-size:26px;letter-spacing:1px">${esc(SALAO.nome)}</div>
      <div style="font-size:13px;color:#d9b48f;letter-spacing:3px;text-transform:uppercase;margin-top:4px">${esc(SALAO.slogan)}</div>
    </td></tr>
    <tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">
      <h2 style="font-family:Georgia,serif;color:#6b3f26;margin:0 0 12px">${titulo}</h2>
      ${corpo}
    </td></tr>
    <tr><td style="background:#efe2d4;padding:18px 32px;font-family:Arial,sans-serif;font-size:12px;color:#6b5546;text-align:center">
      ${esc(SALAO.endereco)}<br>WhatsApp ${esc(SALAO.contato.telefoneExibicao)} · ${esc(SALAO.contato.email)}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

export async function enviarConfirmacao(ag) {
  const linhaWhats = `https://wa.me/${SALAO.contato.whatsapp}?text=${encodeURIComponent(
    `Olá! Tenho um agendamento (${ag.servicoNome}) em ${ag.data.split("-").reverse().join("/")} às ${ag.hora}.`
  )}`;
  const corpo = `
    <p>Olá, <strong>${esc(ag.nome)}</strong>! Seu horário está confirmado. 💛</p>
    <table cellpadding="8" cellspacing="0" style="width:100%;background:#f7efe6;border-radius:10px;margin:16px 0">
      <tr><td style="color:#8a6a55;width:110px">Serviço</td><td><strong>${esc(ag.servicoNome)}</strong></td></tr>
      <tr><td style="color:#8a6a55">Data</td><td><strong>${esc(dataBR(ag.data))}</strong></td></tr>
      <tr><td style="color:#8a6a55">Horário</td><td><strong>${esc(ag.hora)}</strong> (duração aprox. ${ag.duracao} min)</td></tr>
      <tr><td style="color:#8a6a55">Local</td><td>${esc(SALAO.endereco)}</td></tr>
      ${ag.observacoes ? `<tr><td style="color:#8a6a55">Observações</td><td>${esc(ag.observacoes)}</td></tr>` : ""}
    </table>
    <p style="text-align:center;margin:24px 0">
      <a href="${linkGoogleAgenda(ag)}" style="background:#8b5a3c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:30px;display:inline-block;margin:4px">Adicionar ao Google Agenda</a>
      <a href="${linhaWhats}" style="background:#4a2c1d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:30px;display:inline-block;margin:4px">Falar no WhatsApp</a>
    </p>
    <p style="font-size:13px;color:#6b5546">Precisa remarcar ou cancelar? Responda este e-mail ou fale com a gente pelo WhatsApp com pelo menos 2 horas de antecedência.</p>`;

  await transporte().sendMail({
    from: `"${SALAO.nome}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: ag.email,
    replyTo: SALAO.contato.email,
    bcc: process.env.EMAIL_COPIA_SALAO || undefined,
    subject: `✅ Agendamento confirmado — ${ag.servicoNome} em ${ag.data.split("-").reverse().join("/")} às ${ag.hora}`,
    html: layout("Agendamento confirmado", corpo),
    icalEvent: { filename: "agendamento.ics", method: "PUBLISH", content: gerarICS(ag) },
  });
}

export async function enviarCancelamento(ag) {
  const corpo = `
    <p>Olá, <strong>${esc(ag.nome)}</strong>.</p>
    <p>Seu agendamento de <strong>${esc(ag.servicoNome)}</strong> em <strong>${esc(dataBR(ag.data))}</strong> às <strong>${esc(ag.hora)}</strong> foi <strong>cancelado</strong>.</p>
    <p>Quer escolher outro horário? É só acessar nosso site ou chamar no WhatsApp: <a href="https://wa.me/${SALAO.contato.whatsapp}">${esc(SALAO.contato.telefoneExibicao)}</a>.</p>`;
  await transporte().sendMail({
    from: `"${SALAO.nome}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: ag.email,
    replyTo: SALAO.contato.email,
    subject: `Agendamento cancelado — ${SALAO.nome}`,
    html: layout("Agendamento cancelado", corpo),
  });
}
