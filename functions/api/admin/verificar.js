// GET /api/admin/verificar — confirma se o usuário logado é administrador
import { verificarAdmin } from "../../lib/firebase.js";

export default async function handler(req, res) {
  const admin = await verificarAdmin(req);
  if (!admin) return res.status(403).json({ admin: false });
  return res.status(200).json({ admin: true, email: admin.email });
}
