// =============================================================
//  CONFIGURAÇÃO DO SALÃO — edite aqui para cada cliente novo
//  (nome, contatos, redes sociais, serviços e horários)
// =============================================================

export const SALAO = {
  nome: "Atelier Canela",
  slogan: "Beleza & Estética",
  descricao:
    "Um espaço acolhedor para cuidar de você: cabelo, unhas, sobrancelhas e estética com profissionais experientes e produtos de qualidade.",
  endereco: "Rua Exemplo, 123 — Centro, Duque de Caxias - RJ",
  mapsUrl: "https://maps.google.com/?q=Duque+de+Caxias+RJ",

  contato: {
    whatsapp: "5521999999999", // DDI + DDD + número, só dígitos
    telefoneExibicao: "(21) 99999-9999",
    email: "contato@ateliercanela.com.br",
  },

  redes: {
    instagram: "https://instagram.com/ateliercanela",
    facebook: "https://facebook.com/ateliercanela",
    tiktok: "https://tiktok.com/@ateliercanela",
  },

  // Fuso fixo do Brasil (sem horário de verão desde 2019)
  fuso: "America/Sao_Paulo",
  offset: "-03:00",

  // Intervalo entre horários oferecidos (minutos)
  intervaloMin: 30,

  // Antecedência mínima para agendar (minutos) e janela máxima (dias)
  antecedenciaMin: 120,
  diasMaximos: 60,

  // Horário de funcionamento por dia da semana (0 = domingo ... 6 = sábado)
  // null = fechado
  funcionamento: {
    0: null,
    1: null,
    2: { abre: "09:00", fecha: "19:00" },
    3: { abre: "09:00", fecha: "19:00" },
    4: { abre: "09:00", fecha: "19:00" },
    5: { abre: "09:00", fecha: "20:00" },
    6: { abre: "08:00", fecha: "17:00" },
  },

  servicos: [
    { id: "corte", nome: "Corte feminino", duracao: 60, preco: "a partir de R$ 70" },
    { id: "escova", nome: "Escova modelada", duracao: 45, preco: "a partir de R$ 50" },
    { id: "coloracao", nome: "Coloração", duracao: 120, preco: "a partir de R$ 150" },
    { id: "mechas", nome: "Mechas / Luzes", duracao: 180, preco: "a partir de R$ 280" },
    { id: "hidratacao", nome: "Hidratação profunda", duracao: 60, preco: "a partir de R$ 80" },
    { id: "manicure", nome: "Manicure & Pedicure", duracao: 60, preco: "a partir de R$ 55" },
    { id: "sobrancelha", nome: "Design de sobrancelha", duracao: 30, preco: "a partir de R$ 35" },
    { id: "maquiagem", nome: "Maquiagem social", duracao: 60, preco: "a partir de R$ 120" },
  ],
};

export function getServico(id) {
  return SALAO.servicos.find((s) => s.id === id);
}
