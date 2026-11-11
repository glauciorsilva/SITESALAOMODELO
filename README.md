# SITESALAOMODELO

Site modelo para **salões de beleza, estética e barbearias**, com paleta em tons de marrom. É feito para ser duplicado e personalizado para cada cliente.

**O que o site tem:**

- Página institucional com hero, serviços, sobre, galeria e contato
- WhatsApp (botão flutuante e links), e-mail, Instagram, Facebook, TikTok e mapa
- **Agendamento online.** Nome, celular e e-mail são obrigatórios, junto com serviço, data e horário
- Horários livres calculados na hora, sem horário duplicado (usa transação no banco)
- Integração com o **Google Calendar**: cada agendamento vira um evento na agenda do salão, e o que a dona bloquear na agenda some do site
- **E-mail de confirmação** para a cliente, com botão "Adicionar ao Google Agenda", convite `.ics` e atalho para o WhatsApp
- **Banco de clientes** (Firestore): cadastro feito automaticamente, com contagem de agendamentos
- **Painel administrativo** (`/admin`) com login por e-mail/senha ou Google, liberado só para e-mails autorizados
  - Indicadores: agendamentos de hoje, dos próximos 7 dias, total de clientes e cancelados
  - Agendamentos: filtros, busca, concluir, marcar falta, cancelar (remove do Calendar e pode avisar a cliente por e-mail) e exportação em CSV
  - Clientes: busca e exportação em CSV
  - Administradores: autorizar e remover e-mails

---

## Arquitetura

```
Navegador ──► Vercel (site estático: index.html, admin.html, assets/)
   │
   ├─► /api/config        dados públicos do salão (lib/config.js)
   ├─► /api/horarios      horários livres (Firestore + Google Calendar freebusy)
   ├─► /api/agendar       valida → grava cliente + agendamento (transação)
   │                       → cria evento no Google Calendar → envia e-mail
   ├─► /api/admin/verificar   confirma se o login é de administrador
   └─► /api/admin/status      altera status (exige token de admin)

Painel /admin ──► Firebase Auth (login) + Firestore (somente leitura, protegido por regras)
```

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript puro (sem build) |
| Back-end | Vercel Serverless Functions (Node 18+) |
| Banco de dados | Firebase Firestore |
| Autenticação | Firebase Authentication (e-mail/senha e Google) |
| Agenda | Google Calendar API (conta de serviço) |
| E-mail | SMTP via Nodemailer (Gmail com senha de app) |

### Estrutura de pastas

```
├── index.html               site público
├── admin.html               painel administrativo
├── assets/
│   ├── css/style.css        paleta e estilos (variáveis no topo)
│   ├── css/admin.css        estilos do painel
│   ├── js/main.js           serviços, horários e formulário
│   ├── js/admin.js          login e painel
│   └── js/firebase-config.js  configuração WEB do Firebase (pública)
├── api/
│   ├── config.js
│   ├── horarios.js
│   ├── agendar.js
│   └── admin/{verificar,status}.js
├── lib/
│   ├── config.js            ★ dados do salão: nome, contatos, serviços, horários
│   ├── agenda.js            regras de horários e conflitos
│   ├── calendar.js          Google Calendar
│   ├── email.js             e-mails de confirmação e cancelamento
│   └── firebase.js          Firebase Admin e verificação de admin
├── firestore.rules          regras de segurança do Firestore
├── .env.example             variáveis de ambiente
└── vercel.json
```

### Banco de dados (Firestore)

| Coleção | ID do documento | Campos principais |
|---|---|---|
| `clientes` | e-mail (minúsculo) | nome, email, celular, totalAgendamentos, ultimoAgendamento, aceiteLGPD, criadoEm, atualizadoEm |
| `agendamentos` | automático | nome, email, celular, servicoId, servicoNome, duracao, data (AAAA-MM-DD), hora, horaFim, status, observacoes, calendarEventId, criadoEm |
| `admins` | e-mail (minúsculo) | email, origem, adicionadoPor |

Valores de `status`: `confirmado`, `concluido`, `cancelado` e `faltou`.

---

## Passo a passo de configuração

### 1. Firebase

1. Crie um projeto em <https://console.firebase.google.com>.
2. **Firestore Database** → Criar banco (modo produção, região `southamerica-east1`).
3. **Regras**: cole o conteúdo de [`firestore.rules`](firestore.rules) e clique em **Publicar**.
4. **Authentication** → Começar → ative **E-mail/senha** e **Google**.
   - Em **Configurações → Ações do usuário**, **desmarque "Ativar criação de conta"**. Assim ninguém se cadastra sozinho.
   - Em **Configurações → Domínios autorizados**, adicione o domínio da Vercel (ex.: `sitesalaomodelo.vercel.app`) e o domínio próprio.
   - Para login com senha, crie o usuário em **Authentication → Usuários → Adicionar usuário**.
5. **Configurações do projeto → Seus apps → Web (</>)**: registre o app, copie o objeto `firebaseConfig` e cole em [`assets/js/firebase-config.js`](assets/js/firebase-config.js).
6. **Configurações do projeto → Contas de serviço → Gerar nova chave privada**. O JSON baixado é o valor de `GOOGLE_SERVICE_ACCOUNT_JSON`. **Nunca suba esse arquivo para o GitHub.**

### 2. Google Calendar

1. No [Google Cloud Console](https://console.cloud.google.com), no **mesmo projeto do Firebase**, ative a **Google Calendar API**.
2. No Google Agenda da conta do salão, abra **Configurações da agenda → Compartilhar com pessoas específicas**. Adicione o `client_email` da conta de serviço (está no JSON) com a permissão **"Fazer alterações nos eventos"**.
3. Em **Integrar agenda**, copie o **ID da agenda** e use em `GOOGLE_CALENDAR_ID`. Para a agenda principal, o ID é o próprio e-mail.

> Eventos criados manualmente na agenda (folga, almoço, compromisso) **bloqueiam** os horários no site automaticamente.

### 3. E-mail de confirmação (Gmail)

1. A conta Google precisa ter a verificação em duas etapas ativa.
2. Acesse <https://myaccount.google.com/apppasswords> e gere uma **senha de app**.
3. Use essa senha em `SMTP_PASS` e o e-mail em `SMTP_USER` e `SMTP_FROM`.

> Também funciona com outro SMTP (Hostinger, Zoho, Brevo etc.): basta trocar `SMTP_HOST` e `SMTP_PORT`.

### 4. Deploy na Vercel

1. Em <https://vercel.com/new>, importe o repositório `glauciorsilva/SITESALAOMODELO`.
2. Framework preset: **Other**. Não é preciso comando de build.
3. Em **Settings → Environment Variables**, cadastre as variáveis do [`.env.example`](.env.example):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✅ | JSON da conta de serviço (puro ou em base64) |
| `ADMIN_EMAILS` | ✅ | e-mails do primeiro acesso ao painel, separados por vírgula |
| `SMTP_HOST` / `SMTP_PORT` | ✅ | servidor SMTP (padrão Gmail: `smtp.gmail.com` / `465`) |
| `SMTP_USER` / `SMTP_PASS` | ✅ | login e senha de app |
| `SMTP_FROM` | ➖ | remetente (padrão: `SMTP_USER`) |
| `GOOGLE_CALENDAR_ID` | ➖ | vazio = integração com a agenda desligada |
| `EMAIL_COPIA_SALAO` | ➖ | recebe cópia oculta de cada confirmação |

4. Faça o deploy. Depois, entre em `/admin` com um e-mail listado em `ADMIN_EMAILS`. No primeiro login ele é registrado na coleção `admins`, e você passa a autorizar outros e-mails pela aba **Administradores**.

### Rodar localmente

```bash
npm install
npm i -g vercel
cp .env.example .env.local   # preencha os valores
vercel dev                   # http://localhost:3000
```

---

## Personalizar para um novo salão

1. **Dados do salão**: edite [`lib/config.js`](lib/config.js) (nome, slogan, endereço, WhatsApp, e-mail, redes sociais, serviços com duração e preço, horário de funcionamento, intervalo entre horários e antecedência mínima).
2. **Cores**: altere as variáveis no topo de [`assets/css/style.css`](assets/css/style.css) (`--espresso`, `--cafe`, `--chocolate`, `--canela`, `--caramelo`, `--dourado`...).
3. **Textos fixos** (hero, "Sobre", diferenciais): edite direto no [`index.html`](index.html).
4. **Fotos da galeria**: coloque as imagens em `assets/img/` e troque os gradientes `.g1`…`.g6` no CSS por `background-image: url(/assets/img/arquivo.jpg)`.
5. **Barbearia**: troque os serviços em `lib/config.js` (corte masculino, barba, pigmentação...) e os textos do hero.

---

## Segurança e LGPD

- O navegador **não grava** no banco. Toda gravação passa pela API, que valida os dados.
- Regras do Firestore: clientes e agendamentos são **somente leitura**, e só para administradores.
- As rotas `/api/admin/*` verificam o token do Firebase e se o e-mail está autorizado.
- O formulário tem um campo invisível anti-robô (honeypot) e pede **consentimento LGPD** obrigatório.
- O painel não é indexado por buscadores (`noindex`).
- Segredos ficam só nas variáveis de ambiente da Vercel (o `.gitignore` já bloqueia `.env` e chaves JSON).

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Painel mostra "Erro ao carregar (permission-denied)" | o e-mail não está em `admins`, ou as regras não foram publicadas |
| "não tem permissão de administrador" | e-mail fora de `ADMIN_EMAILS` e da coleção `admins` |
| Login com Google falha | o domínio não está em Authentication → Domínios autorizados |
| Agendamento com "⚠ fora do Calendar" | agenda não compartilhada com a conta de serviço, ou Calendar API desativada |
| Agendamento com "⚠ e-mail não enviado" | senha de app errada ou SMTP bloqueado. Veja os logs na Vercel |
| Nenhum horário aparece | dia fechado em `funcionamento`, ou antecedência mínima ainda não atingida |

---

Desenvolvido por **Eternize Empreendimentos**.
