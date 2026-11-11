// POST /api/admin/status — altera o status de um agendamento (somente administradores)
// body: { id, status: "confirmado" | "concluido" | "cancelado" | "faltou", avisarCliente?: boolean }
import { db, FieldValue, verificarAdmin } from "../../lib/firebase.js";
import { removerEvento } from "../../lib/calendar.js";
import { enviarCancelamento } from "../../lib/email.js";

const STATUS = ["confirmado", "concluido", "cancelado", "faltou"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });
  const admin = await verificarAdmin(req);
  if (!admin) return res.status(401).json({ erro: "Acesso restrito a administradores." });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { id, status, avisarCliente } = body;
  if (!id || !STATUS.includes(status)) return res.status(400).json({ erro: "Dados inválidos." });

  const ref = db.collection("agendamentos").doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ erro: "Agendamento não encontrado." });
  const ag = snap.data();

  await ref.update({
    status,
    atualizadoPor: admin.email,
    atualizadoEm: FieldValue.serverTimestamp(),
  });

  if (status === "cancelado" && ag.status !== "cancelado") {
    try { await removerEvento(ag.calendarEventId); } catch (e) { console.error(e.message); }
    if (avisarCliente) {
      try { await enviarCancelamento(ag); } catch (e) { console.error(e.message); }
    }
  }
  return res.status(200).json({ ok: true });
}
