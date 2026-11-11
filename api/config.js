// GET /api/config — dados públicos do salão para o front-end
import { SALAO } from "../lib/config.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json(SALAO);
}
