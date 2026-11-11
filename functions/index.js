// Cloud Function única "api" — o Firebase Hosting redireciona /api/** para cá (ver firebase.json)
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

import config from "./api/config.js";
import horarios from "./api/horarios.js";
import agendar from "./api/agendar.js";
import adminVerificar from "./api/admin/verificar.js";
import adminStatus from "./api/admin/status.js";

setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

const rotas = {
  "/api/config": config,
  "/api/horarios": horarios,
  "/api/agendar": agendar,
  "/api/admin/verificar": adminVerificar,
  "/api/admin/status": adminStatus,
};

export const api = onRequest(
  { secrets: ["SMTP_PASS"], memory: "256MiB", timeoutSeconds: 30 },
  async (req, res) => {
    const caminho = req.path.replace(/\/+$/, "");
    const handler = rotas[caminho];
    if (!handler) return res.status(404).json({ erro: "Rota não encontrada." });
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ erro: "Erro interno." });
    }
  }
);
