// Integração com Google Calendar via conta de serviço.
// A agenda do salão precisa ser compartilhada com o e-mail da conta de serviço
// com a permissão "Fazer alterações nos eventos".
import { google } from "googleapis";
import { getServiceAccount } from "./firebase.js";
import { SALAO } from "./config.js";

let _cal = null;
function cal() {
  if (_cal) return _cal;
  const sa = getServiceAccount();
  const jwt = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  _cal = google.calendar({ version: "v3", auth: jwt });
  return _cal;
}

const CAL_ID = () => process.env.GOOGLE_CALENDAR_ID;
export const calendarioAtivo = () => Boolean(process.env.GOOGLE_CALENDAR_ID);

// Retorna intervalos ocupados na agenda (inclui bloqueios feitos manualmente pela dona)
export async function ocupadosNoCalendar(inicioISO, fimISO) {
  if (!calendarioAtivo()) return [];
  const { data } = await cal().freebusy.query({
    requestBody: { timeMin: inicioISO, timeMax: fimISO, timeZone: SALAO.fuso, items: [{ id: CAL_ID() }] },
  });
  const busy = data.calendars?.[CAL_ID()]?.busy || [];
  return busy.map((b) => ({ inicio: new Date(b.start).getTime(), fim: new Date(b.end).getTime() }));
}

export async function criarEvento({ titulo, descricao, inicioISO, fimISO }) {
  if (!calendarioAtivo()) return null;
  const { data } = await cal().events.insert({
    calendarId: CAL_ID(),
    requestBody: {
      summary: titulo,
      description: descricao,
      start: { dateTime: inicioISO, timeZone: SALAO.fuso },
      end: { dateTime: fimISO, timeZone: SALAO.fuso },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
      colorId: "6",
    },
  });
  return data.id;
}

export async function removerEvento(eventId) {
  if (!calendarioAtivo() || !eventId) return;
  try {
    await cal().events.delete({ calendarId: CAL_ID(), eventId });
  } catch (e) {
    if (e?.code !== 404 && e?.code !== 410) throw e;
  }
}
