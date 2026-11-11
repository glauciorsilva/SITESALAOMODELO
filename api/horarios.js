// GET /api/horarios?data=YYYY-MM-DD&servico=ID — horários livres do dia
import { getServico } from "../lib/config.js";
import { dataValida, ocupadosDoDia, horariosLivres, slotsDoDia } from "../lib/agenda.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ erro: "Método não permitido" });
  const { data, servico } = req.query;
  const s = getServico(servico);
  if (!s) return res.status(400).json({ erro: "Serviço inválido." });
  if (!dataValida(data)) return res.status(400).json({ erro: "Data inválida." });

  if (slotsDoDia(data, s.duracao).length === 0) return res.status(200).json({ fechado: true, horarios: [] });

  try {
    const ocupados = await ocupadosDoDia(data);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ fechado: false, horarios: horariosLivres(data, s.duracao, ocupados) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Não foi possível consultar os horários agora." });
  }
}
