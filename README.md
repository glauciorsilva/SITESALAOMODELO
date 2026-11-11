# SITESALAOMODELO

Site modelo para **salões de beleza, estética e barbearias**, com paleta em tons de marrom. É feito para ser duplicado e personalizado para cada cliente.
Roda 100% no **Firebase**: Hosting, Cloud Functions, Firestore e Authentication.

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
Navegador ──► Firebase Hosting (public/: index.html, admin.html, assets/)
   │
   └─► /api/**  ──(rewrite)──► Cloud Function "api" (southamerica-east1)
          ├─ /api/config            dados públicos do salão
          ├─ /api/horarios          horários livres (Firestore + Calendar freebusy)
          ├─ /api/agendar           valida → grava cliente + agendamento (transação)
          │                          → cria evento no Google Calendar → envia e-mail
          ├─ /api/admin/verificar   confirma se o login é de administrador
          └─ /api/admin/status      altera status (exige token de admin)

Painel /admin ──► Firebase Auth (login) + Firestore (somente leitura, protegido por regras)
```

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript puro (sem build), no Firebase Hosting |
| Back-end | Cloud Functions 2ª geração (Node 20), região São Paulo |
| Banco de dados | Firestore |
| Autenticação | Firebase Authentication (e-mail/senha e Google) |
| Agenda | Google Calendar API (conta de serviço padrão das Functions, sem chave JSON) |
| E-mail | SMTP via Nodemailer (Gmail com senha de app guardada no Secret Manager) |

### Estrutura de pastas

```
├── firebase.json            Hosting + rewrites /api + Functions + Firestore
├── .firebaserc              projeto padrão (siteestetic)
├── firestore.rules          regras de segurança
├── firestore.indexes.json
├── public/                  ← site (Firebase Hosting)
│   ├── index.html
│   ├── admin.html
│   └── assets/
│       ├── css/style.css    paleta e estilos (variáveis no topo)
│       ├── css/admin.css
│       ├── js/main.js       serviços, horários e formulário
│       ├── js/admin.js      login e painel
│       └── js/firebase-config.js  configuração WEB do Firebase
└── functions/               ← back-end (Cloud Functions)
    ├── index.js             função "api" e roteador
    ├── .env.example         variáveis (copiar para .env)
    ├── api/                 config, horarios, agendar, admin/{verificar,status}
    └── lib/
        ├── config.js        ★ dados do salão: nome, contatos, serviços, horários
        ├── agenda.js        regras de horários e conflitos
        ├── calendar.js      Google Calendar
        ├── email.js         e-mails de confirmação e cancelamento
        └── firebase.js      Firebase Admin e verificação de admin
```

### Banco de dados (Firestore)

| Coleção | ID do documento | Campos principais |
|---|---|---|
| `clientes` | e-mail (minúsculo) | nome, email, celular, totalAgendamentos, ultimoAgendamento, aceiteLGPD, criadoEm, atualizadoEm |
| `agendamentos` | automático | nome, email, celular, servicoId, servicoNome, duracao, data (AAAA-MM-DD), hora, horaFim, status, observacoes, calendarEventId, criadoEm |
| `admins` | e-mail (minúsculo) | email, origem, adicionadoPor |

Valores de `status`: `confirmado`, `concluido`, `cancelado` e `faltou`.

---

## Passo a passo de configuração (projeto `siteestetic`)

> ⚠️ **As Cloud Functions exigem o plano Blaze** (pago conforme o uso). Ele tem cota gratuita mensal grande, suficiente para um salão. Também é o Blaze que libera as chamadas externas (Gmail e Google Calendar). No Console: ⚙️ → Uso e faturamento → Detalhes e configurações → **Modificar plano**. Vale configurar um **alerta de orçamento** (ex.: R$ 10).

### 1. Firebase Console

1. **Firestore Database** → Criar banco (modo produção, região `southamerica-east1`).
2. **Authentication** → Começar → ative **E-mail/senha** e **Google**.
   - Em **Configurações → Ações do usuário**, **desmarque "Ativar criação de conta"**. Assim ninguém se cadastra sozinho.
   - Para login com senha, crie o usuário em **Authentication → Usuários → Adicionar usuário**.
   - Os domínios `siteestetic.web.app` e `siteestetic.firebaseapp.com` já vêm autorizados. Se usar domínio próprio, adicione-o em **Domínios autorizados**.
3. A configuração Web já está em [`public/assets/js/firebase-config.js`](public/assets/js/firebase-config.js).

### 2. Google Calendar

1. Ative a **Google Calendar API** no projeto:
   <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=siteestetic> → **Ativar**.
2. Descubra o e-mail da conta de serviço das Functions. Ele tem o formato `NUMERO-DO-PROJETO-compute@developer.gserviceaccount.com`; para este projeto é **`413672821818-compute@developer.gserviceaccount.com`**. Para conferir: Google Cloud → IAM e administrador → Contas de serviço.
3. No Google Agenda do salão, abra **Configurações da agenda → Compartilhar com pessoas específicas**. Adicione esse e-mail com a permissão **"Fazer alterações nos eventos"**.
4. Em **Integrar agenda**, copie o **ID da agenda** e coloque em `GOOGLE_CALENDAR_ID`. Para a agenda principal, o ID é o próprio e-mail.

> Eventos criados manualmente na agenda (folga, almoço, compromisso) **bloqueiam** os horários no site automaticamente.

### 3. E-mail de confirmação (Gmail)

1. A conta Google precisa ter a verificação em duas etapas ativa.
2. Gere uma **senha de app** em <https://myaccount.google.com/apppasswords>.
3. Ela vai para o Secret Manager no passo 4. Ela **não** fica no `.env`.

### 4. Deploy pelo terminal (VS Code)

```bash
npm install -g firebase-tools
firebase login
cd functions && npm install && cd ..

# variáveis (não secretas)
cp functions/.env.example functions/.env       # edite ADMIN_EMAILS, GOOGLE_CALENDAR_ID, SMTP_USER...

# segredo: senha de app do Gmail
firebase functions:secrets:set SMTP_PASS

# publica tudo: site + função + regras do Firestore
firebase deploy
```

O site fica em **https://siteestetic.web.app**. O painel fica em **https://siteestetic.web.app/admin**: entre com um e-mail de `ADMIN_EMAILS`. No primeiro login ele é registrado na coleção `admins`, e você passa a autorizar outros e-mails pela aba **Administradores**.

Para publicar só uma parte:

```bash
firebase deploy --only hosting      # só o site (HTML/CSS/JS)
firebase deploy --only functions    # só o back-end
firebase deploy --only firestore    # só as regras
```

### Testar localmente

```bash
firebase emulators:start
# site em http://localhost:5000 · painel dos emuladores em http://localhost:4000
```

---

## Personalizar para um novo salão

1. Crie um projeto Firebase novo para o cliente e troque o ID em `.firebaserc` e o `firebaseConfig` em `public/assets/js/firebase-config.js`.
2. **Dados do salão**: edite [`functions/lib/config.js`](functions/lib/config.js) (nome, slogan, endereço, WhatsApp, e-mail, redes sociais, serviços com duração e preço, horário de funcionamento, intervalo entre horários e antecedência mínima).
3. **Cores**: altere as variáveis no topo de [`public/assets/css/style.css`](public/assets/css/style.css).
4. **Textos fixos** (hero, "Sobre", diferenciais): edite direto no [`public/index.html`](public/index.html).
5. **Fotos da galeria**: coloque as imagens em `public/assets/img/` e troque os gradientes `.g1`…`.g6` no CSS por `background-image: url(/assets/img/arquivo.jpg)`.
6. **Barbearia**: troque os serviços (corte masculino, barba, pigmentação...) e os textos do hero.

---

## Segurança e LGPD

- O navegador **não grava** no banco. Toda gravação passa pela Cloud Function, que valida os dados.
- Regras do Firestore: clientes e agendamentos são **somente leitura**, e só para administradores.
- As rotas `/api/admin/*` verificam o token do Firebase e se o e-mail está autorizado.
- A senha do e-mail fica no **Secret Manager**. Não há chave de conta de serviço no código.
- O formulário tem um campo invisível anti-robô (honeypot) e pede **consentimento LGPD** obrigatório.
- O painel não é indexado por buscadores (`noindex`).

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| `firebase deploy` reclama do plano | o projeto precisa estar no **Blaze** para usar Functions |
| Painel mostra "permission-denied" | o e-mail não está em `admins`, ou as regras não foram publicadas (`firebase deploy --only firestore`) |
| "não tem permissão de administrador" | e-mail fora de `ADMIN_EMAILS` e da coleção `admins` |
| Login com Google falha | o domínio não está em Authentication → Domínios autorizados |
| Agendamento com "⚠ fora do Calendar" | Calendar API desativada, ou agenda não compartilhada com `...-compute@developer.gserviceaccount.com` |
| Agendamento com "⚠ e-mail não enviado" | senha de app errada ou segredo `SMTP_PASS` não definido. Veja `firebase functions:log` |
| Nenhum horário aparece | dia fechado em `funcionamento`, ou antecedência mínima ainda não atingida |

---

Desenvolvido por **Eternize Empreendimentos**.
