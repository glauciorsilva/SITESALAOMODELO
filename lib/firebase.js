// Inicialização do Firebase Admin (lado servidor / Vercel Functions)
import admin from "firebase-admin";

function lerServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Variável GOOGLE_SERVICE_ACCOUNT_JSON não configurada.");
  // Aceita JSON puro ou JSON codificado em base64
  const texto = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(texto);
}

export function getServiceAccount() {
  return lerServiceAccount();
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(lerServiceAccount()) });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;

// Verifica o token do Firebase Auth e se o e-mail está na lista de administradores.
// Lista de admins = coleção "admins" (id do doc = e-mail) + variável ADMIN_EMAILS.
export async function verificarAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    if (!email) return null;
    const envAdmins = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (envAdmins.includes(email)) {
      // Garante o doc em /admins para que as regras do Firestore liberem a leitura no painel
      await db.collection("admins").doc(email).set({ email, origem: "ADMIN_EMAILS" }, { merge: true });
      return { email, uid: decoded.uid };
    }
    const doc = await db.collection("admins").doc(email).get();
    return doc.exists ? { email, uid: decoded.uid } : null;
  } catch {
    return null;
  }
}
