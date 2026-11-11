// Regras de horários: geração de slots, conflitos e ocupação.
import { SALAO } from "./config.js";
import { db } from "./firebase.js";
import { ocupadosNoCalendar } from "./calendar.js";

export const toMs = (dataISO, hora) => new Date(`${dataISO}T${hora}:00${SALAO.offset}`).getTime();
export const isoComFuso = (dataISO, hora) => `${dataISO}T${hora}:00${SALAO.offset}`;

const pad = (n) => String(n).padStart(2, "0");
const minParaHora = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const horaParaMin = (h) => {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
};

export function diaDaSemana(dataISO) {
  return new Date(`${dataISO}T12:00:00${SALAO.offset}`).getUTCDay();
}

export function addMinutos(dataISO, hora, minutos) {
  const fim = horaParaMin(hora) + minutos;
  return minParaHora(fim);
}

export function dataValida(dataISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return false;
  const t = toMs(dataISO, "12:00");
  if (Number.isNaN(t)) return false;
  const agora = Date.now();
  return t > agora - 24 * 3600e3 && t < agora + SALAO.diasMaximos * 24 * 3600e3;
}

// Todos os horários possíveis do dia para um serviço com determinada duração
export function slotsDoDia(dataISO, duracao) {
  const f = SALAO.funcionamento[diaDaSemana(dataISO)];
  if (!f) return [];
  const abre = horaParaMin(f.abre);
  const fecha = horaParaMin(f.fecha);
  const out = [];
  for (let m = abre; m + duracao <= fecha; m += SALAO.intervaloMin) out.push(minParaHora(m));
  return out;
}

// Intervalos ocupados no dia: agendamentos ativos no Firestore + bloqueios do Google Calendar
export async function ocupadosDoDia(dataISO) {
  const snap = await db.collection("agendamentos").where("data", "==", dataISO).get();
  const doBanco = snap.docs
    .map((d) => d.data())
    .filter((a) => a.status !== "cancelado")
    .map((a) => ({ inicio: toMs(a.data, a.hora), fim: toMs(a.data, a.hora) + a.duracao * 60e3 }));

  let doCalendar = [];
  try {
    doCalendar = await ocupadosNoCalendar(isoComFuso(dataISO, "00:00"), isoComFuso(dataISO, "23:59"));
  } catch (e) {
    console.error("Falha ao consultar Google Calendar (seguindo só com o banco):", e.message);
  }
  return [...doBanco, ...doCalendar];
}

export const conflita = (ini, fim, ocupados) => ocupados.some((o) => ini < o.fim && fim > o.inicio);

export function horariosLivres(dataISO, duracao, ocupados) {
  const limite = Date.now() + SALAO.antecedenciaMin * 60e3;
  return slotsDoDia(dataISO, duracao).filter((h) => {
    const ini = toMs(dataISO, h);
    return ini >= limite && !conflita(ini, ini + duracao * 60e3, ocupados);
  });
}
