# SITESALAOMODELO

Site modelo para **salões de beleza, estética e barbearias**, com paleta em tons de marrom. É feito para ser duplicado e personalizado para cada cliente.

**Custo de infraestrutura: R$ 0.** Usa o **Firebase no plano gratuito (Spark)** para o site, o banco e o login, e o **Google Apps Script** como back-end para a agenda. Não precisa de cartão, Cloud Functions nem Vercel.

**O que o site tem:**

- Página institucional com hero, serviços, sobre, galeria e contato
- WhatsApp (botão flutuante e links), e-mail, Instagram, Facebook, TikTok e mapa
- **Agendamento online.** Nome, celular e e-mail são obrigatórios, junto com serviço, data e horário
- Horários livres calculados na hora a partir do **Google Agenda do salão**, sem horário duplicado (trava no servidor)
- Cada agendamento vira um **evento no Google Agenda**. Folgas, almoço e feriados marcados na agenda somem do site
- A confirmação aparece na tela, com o botão **"Adicionar à minha agenda"** para a cliente
- **Banco de clientes** (Firestore): cadastro feito automaticamente, com contagem de agendamentos
- **Painel administrativo** (`/admin`) com login por e-mail/senha ou Google, liberado só para e-mails autorizados
  - Indicadores: agendamentos de hoje, dos próximos 7 dias, total de clientes e cancelados
  - Agendamentos: filtros, busca, concluir, marcar falta, cancelar (remove da agenda) e exportação em CSV
  - Clientes: busca e exportação em CSV
  - Administradores: autorizar e remover e-mails

> O envio de e-mail de confirmação foi retirado desta versão. Ele será feito por outro método.

---

## Arquitetura

```
Navegador ──► Firebase Hosting (public/)  ── plano gratuito
   │
   ├─► Google Apps Script (App da Web, executa como o dono)
   │      GET  ?acao=config     dados do salão
   │      GET  ?acao=horarios   horários livres (lê o Google Agenda)
   │      POST agendar          trava → cria evento na agenda → grava no Firestore (API REST)
   │      POST verificar        valida o login do painel (token do Firebase Auth)
   │      POST status           concluir / faltou / cancelar (cancelar apaga o evento)
   │
   └─► Painel /admin ──► Firebase Auth + Firestore (somente leitura, protegido por regras)
```

| Camada | Tecnologia | Custo |
|---|---|---|
| Site e painel | HTML, CSS e JS puro no **Firebase Hosting** | grátis |
| Banco de dados | **Firestore** | grátis (cota diária) |
| Login | **Firebase Authentication** (e-mail/senha e Google) | grátis |
| Back-end e agenda | **Google Apps Script** + **Google Agenda** | grátis |

### Estrutura de pastas

```
├── firebase.json            Hosting (site "sitestetic") + regras do Firestore
├── .firebaserc              projeto padrão (siteestetic)
├── firestore.rules          regras de segurança
├── firestore.indexes.json
├── apps-script/             ← back-end (copiar para script.google.com)
│   ├── Code.gs              ★ dados do salão (serviços, horários, contatos) + lógica
│   └── appsscript.json      fuso horário e permissões
└── public/                  ← site (Firebase Hosting)
    ├── index.html
    ├── admin.html
    └── assets/
        ├── css/style.css    paleta e estilos (variáveis no topo)
        ├── css/admin.css
        ├── js/api.js        ★ URL do Apps Script (API_URL)
        ├── js/main.js       serviços, horários e formulário
        ├── js/admin.js      login e painel
        └── js/firebase-config.js  configuração WEB do Firebase
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

> Faça tudo com a **conta Google dona do projeto Firebase**. O Apps Script roda com essa conta para gravar no Firestore sem precisar de chave.

### 1. Firebase Console (plano gratuito)

1. **Firestore Database** → Criar banco (modo produção, região `southamerica-east1`).
2. **Authentication** → Começar → ative **E-mail/senha** e **Google**.
   - Em **Configurações → Ações do usuário**, **desmarque "Ativar criação de conta"**. Assim ninguém se cadastra sozinho.
   - Em **Configurações → Domínios autorizados**, adicione **`sitestetic.web.app`** e **`sitestetic.firebaseapp.com`**.
   - Para login com senha, crie o usuário em **Authentication → Usuários → Adicionar usuário**.

### 2. Google Agenda do salão

- **Se a agenda é da mesma conta:** use a agenda principal (deixe `CALENDAR_ID` vazio) ou crie uma agenda "Salão" e copie o ID dela.
- **Se a agenda é de outra conta (a do salão):** nas configurações da agenda, em **Compartilhar com pessoas específicas**, adicione a conta dona do Firebase com a permissão **"Fazer alterações nos eventos"**. Depois copie o **ID da agenda** (em "Integrar agenda").

### 3. Google Apps Script (back-end)

1. Acesse <https://script.google.com> → **Novo projeto** → dê o nome "Salão — API".
2. Cole o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs) no arquivo `Código.gs`.
3. Em ⚙️ **Configurações do projeto**, marque **"Mostrar o arquivo de manifesto appsscript.json"** e cole o conteúdo de [`apps-script/appsscript.json`](apps-script/appsscript.json).
4. Ainda em Configurações, em **Propriedades do script**, adicione:

| Propriedade | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | `siteestetic` |
| `FIREBASE_WEB_API_KEY` | a `apiKey` do `firebaseConfig` |
| `ADMIN_EMAILS` | seu e-mail (e de quem mais acessar o painel), separados por vírgula |
| `CALENDAR_ID` | ID da agenda do salão (vazio = agenda principal) |
| `CONVIDAR_CLIENTE` | `sim` se quiser que a cliente receba o convite do Google Agenda (opcional) |

5. No editor, selecione a função **`testarConfiguracao`** → **Executar** → autorize as permissões (Agenda, Firestore e conexões externas). O registro deve mostrar o nome da agenda e os horários livres.
6. **Implantar → Nova implantação → tipo "App da Web"**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Copie a **URL do app da Web** (termina em `/exec`) e cole em [`public/assets/js/api.js`](public/assets/js/api.js), na constante `API_URL`.

> Ao alterar o `Code.gs` depois, vá em **Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão**. Assim a URL continua a mesma.

### 4. Publicar o site (terminal do VS Code)

```bash
npm install -g firebase-tools
firebase login
firebase deploy           # publica o site (sitestetic) e as regras do Firestore
```

O site fica em **https://sitestetic.web.app**. O painel fica em **https://sitestetic.web.app/admin**: entre com um e-mail de `ADMIN_EMAILS`. No primeiro login ele é registrado em `admins`, e você passa a autorizar outros e-mails pela aba **Administradores**.

Para testar local antes de publicar: `firebase emulators:start --only hosting` → <http://localhost:5000>.

---

## Personalizar para um novo salão

1. Crie um projeto Firebase novo para o cliente e troque o ID em `.firebaserc`, o `site` em `firebase.json` e o `firebaseConfig`.
2. **Dados do salão** (nome, contatos, redes, serviços, horários): edite o bloco `SALAO` no topo do **`Code.gs`** e publique uma nova versão.
3. **Cores**: altere as variáveis no topo de `public/assets/css/style.css`.
4. **Textos fixos** (hero, "Sobre", diferenciais): edite direto em `public/index.html`.
5. **Fotos da galeria**: coloque as imagens em `public/assets/img/` e troque os gradientes `.g1`…`.g6` no CSS por `background-image: url(/assets/img/arquivo.jpg)`.
6. **Barbearia**: troque os serviços no `Code.gs` e os textos do hero.

---

## Segurança e LGPD

- O navegador **não grava** no banco. Quem grava é o Apps Script, com a conta dona do projeto, depois de validar os dados.
- Regras do Firestore: clientes e agendamentos são **somente leitura**, e só para administradores.
- Ações do painel (`verificar` e `status`) validam o token do Firebase Auth no Google e conferem se o e-mail é administrador.
- Uma trava (`LockService`) impede dois agendamentos no mesmo horário.
- O formulário tem um campo invisível anti-robô (honeypot) e pede **consentimento LGPD** obrigatório.
- O painel não é indexado por buscadores (`noindex`).

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Site sem serviços / "Erro de conexão" | `API_URL` errada em `api.js`, ou o app da Web não está como "Qualquer pessoa" |
| Mudança no `Code.gs` não aparece | faltou publicar uma **nova versão** da implantação |
| "Agenda não encontrada" | `CALENDAR_ID` errado, ou a agenda não está compartilhada com a conta do script |
| Erro "Firestore commit 403" | o script não roda com a conta dona do projeto Firebase, ou faltou autorizar |
| Painel com "permission-denied" | o e-mail não está em `admins`, ou as regras não foram publicadas (`firebase deploy --only firestore`) |
| "não tem permissão de administrador" | e-mail fora de `ADMIN_EMAILS` e da coleção `admins` |
| Login com Google falha | `sitestetic.web.app` não está nos domínios autorizados do Authentication |
| Nenhum horário aparece | dia fechado em `funcionamento`, evento de dia inteiro na agenda, ou antecedência mínima ainda não atingida |

Logs do back-end: no editor do Apps Script, menu **Execuções**.

---

Desenvolvido por **Eternize Empreendimentos**.
