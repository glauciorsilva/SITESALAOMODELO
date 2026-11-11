// Comunicação com o back-end (Google Apps Script publicado como App da Web).
// Cole aqui a URL da implantação: Implantar → Gerenciar implantações → URL do app da Web (termina em /exec)
export const API_URL = "https://script.google.com/macros/s/AKfycbxrBxknN1a4vqKg4ciZEYEXj-K7_BFWk2_Ywm57OfVIugUJI_4VNM9dEPT6ynqsXkqe/exec";

// GET ?acao=...
export async function apiGet(acao, params = {}) {
  const u = new URL(API_URL);
  u.searchParams.set("acao", acao);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { redirect: "follow" });
  return r.json();
}

// POST com text/plain para evitar o preflight CORS (o Apps Script não responde OPTIONS)
export async function apiPost(acao, dados = {}) {
  const r = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ acao, ...dados }),
  });
  return r.json();
}
