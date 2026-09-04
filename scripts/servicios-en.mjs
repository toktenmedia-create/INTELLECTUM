/**
 * THE SIX SERVICE PAGES, IN ENGLISH.
 *
 * Same six services as SERVICIOS in generar-servicios.mjs, same structure,
 * same claims. This is a translation, not a second product: if one side says
 * something the other doesn't, one of the two is wrong — and the source of
 * truth for both is lib/ficha.js, the same document IntelliA answers from.
 *
 * WHY A SEPARATE FILE. Keeping both languages in one object would double the
 * length of every service and make it easy to edit one language and forget the
 * other. Split, the two files are readable side by side, and "npm run paginas"
 * writes twelve pages from them.
 *
 * `es` IS NOT DECORATION. It names the Spanish slug this page translates, and
 * that pairing is what lets each page declare hreflang honestly: the Spanish
 * page points at the English one and the English one points back. x-default
 * points at the Spanish page in both, because the business sells in Ecuador.
 */

export const SERVICIOS_EN = [
  {
    es: "agentes-de-ia-whatsapp",
    slug: "ai-agents-whatsapp",
    nav: "AI agents",
    titulo: "AI agents for WhatsApp and your website",
    h1a: "An AI agent that answers your",
    h1b: "WhatsApp and your site.",
    tituloTag: "AI Agents for WhatsApp in Ecuador | Intellectum",
    descripcion:
      "AI agents trained on your business information that answer on WhatsApp and on your website chat around the clock, qualify leads and book appointments. Quito, Ecuador.",
    lead: "The same agent on both channels, trained on your business information. It answers whenever people write, works out what each person needs, books the appointment and leaves everything written down in your panel. When something needs a human, it says so and steps aside.",
    queEntrada:
      "It isn't a menu of options or a tree of buttons. It's an agent that holds a conversation, and what it's allowed to say comes from a brief filled in with your data: your services, your hours, your terms, the way you talk.",
    que: [
      "<strong>Answers 24/7</strong> with your business information, not with generic answers from the internet.",
      "<strong>Qualifies every lead</strong>: asks what it takes to know whether this is your customer, and how urgent it is.",
      "<strong>Books the appointment</strong> against the free slots in your Google Calendar, and sends the confirmation and the reminder.",
      "<strong>Recognises returning people</strong>: it doesn't ask for their name again or repeat what you already discussed.",
      "<strong>Flags when a human is needed</strong> and stops replying so it isn't in the way; your team picks the conversation up from the panel and hands it back when they're done.",
      "<strong>Writes everything down</strong>: every contact lands in your panel with their record, their status and the full history.",
    ],
    comoEntrada:
      "WhatsApp runs on Meta's official API, not on a phone wired to a program. That matters: the number belongs to your company, it doesn't drop because someone logged out, and there's no risk of Meta blocking it for using an unauthorised route.",
    como: [
      "<strong>Diagnosis.</strong> We look at what people ask you today, what you answer, and where your time goes.",
      "<strong>The brief.</strong> We put your business into a document: services, prices, hours, terms, what the agent may say and what it's forbidden to say.",
      "<strong>Connection.</strong> The WhatsApp number goes onto Meta's official API and the chat is embedded in your site. Google Calendar is connected if you want it booking.",
      "<strong>Pilot and tuning.</strong> It goes live with your team watching, and it's corrected with real conversations, not assumptions.",
    ],
    necesitas: [
      "A mobile number that is <strong>not in use in the WhatsApp app</strong>: once a number joins the API it stops opening on the phone.",
      "A Meta Business account in your company's name (if you don't have one, we create it with you).",
      "Your business information: what you sell, at what price, during what hours, on what terms.",
      "A Google Calendar, only if you want it booking.",
    ],
    limites: [
      "It doesn't handle Instagram or Messenger. The channels are WhatsApp, your website chat and phone calls.",
      "It doesn't go looking for people. It answers whoever writes; there's no cold outreach.",
      "It doesn't close the sale on its own. It qualifies, quotes and books; your team closes.",
      "It doesn't make things up. What isn't in its brief, it doesn't say: it hands you over to a person.",
    ],
    faq: [
      {
        p: "Can I use my current WhatsApp number?",
        r: "Yes, but it stops working in the phone app: a number is either in the app or on Meta's API, never both. So the usual move is to leave the everyday number for your team and put a new one on the agent — or the other way round, if the number people already know is the one you want automated.",
      },
      {
        p: "How long until it's running?",
        r: "Most projects are live between 2 and 6 weeks from the diagnosis. Cases with several integrations can stretch to 8 or 10 weeks.",
      },
      {
        p: "Does my team need to be technical to run it?",
        r: "No. The panel is simple, it's handed over with training, and support comes from the same team that built it.",
      },
      {
        p: "What happens to my customers' data?",
        r: "It travels encrypted and is stored encrypted, the panel is protected with one password per business, and each client's data is separated in the database. We sign an NDA when the integration calls for it.",
      },
    ],
    schema: {
      name: "AI agents for WhatsApp and website chat",
      description:
        "Artificial intelligence agents trained on the business's own information that handle WhatsApp and website chat 24/7, qualify leads and book appointments in Google Calendar.",
    },
  },

  {
    es: "llamadas-con-ia",
    slug: "ai-voice-calls",
    nav: "AI voice calls",
    titulo: "AI voice calls",
    h1a: "AI voice calls for what",
    h1b: "chat can't reach.",
    tituloTag: "AI Voice Calls in Ecuador | Intellectum",
    descripcion:
      "AI voice calls to confirm appointments, remind people of visits and follow up with leads who left their details and never came back. It runs on top of the agent you already have.",
    lead: "Some people never read messages and always pick up the phone. For them there's an AI voice that calls, says what it's calling about, and writes down the answer. It doesn't replace the chat agent: it sits on top of the plan you already have.",
    queEntrada:
      "Voice is for specific moments, not for replacing your sales team. These are the ones it handles well:",
    que: [
      "<strong>Confirming an appointment</strong> the day before, and recording whether the person confirms, moves it or cancels.",
      "<strong>Reminding someone of a booked visit</strong>, with the time and the place.",
      "<strong>Following up with someone who left their details</strong> and never wrote again.",
      "<strong>Leaving the call in writing</strong> in the same panel as everything else: the call doesn't live only in the memory of whoever made it.",
    ],
    comoEntrada:
      "Scope and minutes are agreed in the consultation, because the cost depends on volume. You won't find a per-minute rate here: the one that fits you comes from knowing how many calls you'll actually make.",
    como: [
      "<strong>What for.</strong> We decide which calls get automated and which stay human.",
      "<strong>The script.</strong> What the voice says, what it asks, and at what point it hands the call to a person.",
      "<strong>The hook-up.</strong> It's connected to the agent and the calendar you already have, so the call knows which appointment it's talking about.",
      "<strong>Pilot.</strong> A small group first; we listen to the recordings and fix things before opening it up.",
    ],
    necesitas: [
      "An agent plan with us already running: voice <strong>sits on top</strong>, it isn't sold on its own.",
      "A rough idea of volume: how many calls a month.",
      "A decision on what should happen when the person asks to speak to a real human.",
    ],
    limites: [
      "No cold outreach and no calling bought lists.",
      "It doesn't close sales. It confirms, reminds and follows up; the rest is your team.",
      "There's no published per-minute rate: it depends on volume and is quoted in the consultation.",
      "It isn't sold without an agent: it's an add-on to the plan, not a separate product.",
    ],
    faq: [
      {
        p: "How much is a minute?",
        r: "We don't publish a per-minute rate because it changes with volume and with the kind of call. We take the case in the free consultation and you get a number in writing. The chat won't give you a range for this either: it would rather say nothing than say the wrong figure.",
      },
      {
        p: "Can it call numbers in Ecuador?",
        r: "Yes. Exactly which number shows up on the recipient's screen is settled in the consultation, because it depends on how the line is connected.",
      },
      {
        p: "Can people tell it's an AI?",
        r: "The voice is clear and natural, and the agent says who it's calling on behalf of. It doesn't pretend to be a person: besides being wrong, that gets found out on its own.",
      },
    ],
    schema: {
      name: "AI voice calls",
      description:
        "Phone calls with an artificial intelligence voice to confirm appointments, remind people of visits and follow up with leads. Implemented on top of an existing agent plan.",
    },
  },

  {
    es: "ventas-automatizadas",
    slug: "automated-sales",
    nav: "Automated sales",
    titulo: "Automated sales: follow-up, quotes and reminders",
    h1a: "The one who asked and never came back",
    h1b: "isn't lost.",
    tituloTag: "Automated Sales with AI in Ecuador | Intellectum",
    descripcion:
      "Automatic WhatsApp follow-up for people who asked about price and went quiet, instant ballpark quotes and appointment reminders. Every lead reaches your team already qualified.",
    lead: "Most sales aren't lost on price: they're lost because nobody wrote back. Automatic follow-up picks up the person who asked for a price and went quiet, and only the ones who are ready to talk reach your team.",
    queEntrada:
      "All of this happens without anyone on your team having to remember to do it, which is exactly the point:",
    que: [
      "<strong>Automatic follow-up</strong> over WhatsApp for people who asked about price and stopped replying.",
      "<strong>An instant price range</strong> inside the conversation, when the plan includes it, following the rules you set.",
      "<strong>An appointment reminder</strong> before the hour, so the calendar doesn't fill up with people who never show.",
      "<strong>Every lead qualified and in context</strong>: your team opens the record and sees what they asked, what they were told and where it was left.",
      "<strong>The pipeline in plain sight</strong> in the panel: leads by status, and the money sitting in each column.",
    ],
    comoEntrada:
      "Follow-up isn't a mass message. It comes out of the conversation that person actually had, at the moment it makes sense, and it stops on its own if they reply or ask not to be written to again.",
    como: [
      "<strong>The rules.</strong> We decide who gets followed up, when, and how many times. Without overdoing it: that burns the number.",
      "<strong>The prices.</strong> Your quoting rules are loaded in: what's covered, what depends on the case, and what is never quoted over chat.",
      "<strong>The panel.</strong> Your pipeline stages are built with the names your team already uses.",
      "<strong>Measurement.</strong> We watch which messages get replies and adjust them.",
    ],
    necesitas: [
      "The WhatsApp agent running: follow-up travels through it.",
      "Your pricing rules, even as ranges: what can be said over chat and what can't.",
      "The stages a lead goes through in your business.",
    ],
    limites: [
      "It isn't mass sending or campaigns to lists: it writes to people who already talked to you.",
      "It doesn't close the sale. It leaves the lead warm and informed; your team closes.",
      "It doesn't invent prices. If something isn't in the rules, it hands over to a person.",
      "Automatic follow-up comes in from a certain plan upward, not on the smallest one.",
    ],
    faq: [
      {
        p: "Doesn't it annoy customers to be written to automatically?",
        r: "It depends how many times and what it says. That's why the rules are set with you and the follow-up stops the moment the person replies or asks you to stop. Follow-up done well is appreciated; follow-up that insists five times burns the number.",
      },
      {
        p: "Is the quote the agent gives binding?",
        r: "It's a reference range, and the agent says so. The exact price comes out of the diagnosis. The range is there so the conversation doesn't die on “it depends”.",
      },
      {
        p: "Can I see what it's doing?",
        r: "Yes, in the panel: every conversation, every lead and every appointment, with the history. It can also be exported to Excel.",
      },
    ],
    schema: {
      name: "Automated sales with AI",
      description:
        "Automatic WhatsApp follow-up, instant reference quotes and appointment reminders, with a lead panel and a pipeline by status.",
    },
  },

  {
    es: "automatizacion-a-medida",
    slug: "custom-automation",
    nav: "Custom automation",
    titulo: "Custom automation across your systems",
    h1a: "What someone copies today",
    h1b: "from one screen to another.",
    tituloTag: "Custom Automation with AI in Ecuador | Intellectum",
    descripcion:
      "We connect CRM, ERP, spreadsheets, email and payment gateways into flows that run repetitive tasks, validate data and flag the exceptions.",
    lead: "Almost every business has someone moving data from one screen to another. That's a process, not a job. It can be automated, and what your team gains is the time that goes today into copying, pasting and double-checking.",
    queEntrada:
      "This isn't sold from a catalogue: every case is different, which is why it's studied before it's quoted. What does repeat is the shape:",
    que: [
      "<strong>Connecting systems that don't talk to each other today</strong>: CRM, ERP, spreadsheets, email, payment gateways.",
      "<strong>Running the whole repetitive task</strong>, not a piece of it: read, validate, write and confirm.",
      "<strong>Flagging the exception</strong>, which is the only part that genuinely needs a person.",
      "<strong>Leaving a record</strong> of what was done and when, so it can be audited instead of taken on the system's word.",
    ],
    comoEntrada:
      "The price of this doesn't come from a range: it comes from looking at the process. That's why the chat doesn't quote custom automation — it takes the case and books the consultation.",
    como: [
      "<strong>The map.</strong> We follow the process as it actually is today, with the person who does it, not the person who describes it.",
      "<strong>The cut.</strong> We decide what gets automated and what stays with a person. Not everything should be automated.",
      "<strong>The build.</strong> Each system is connected through its API and tested with real data, running alongside the current process.",
      "<strong>The handover.</strong> Only once the automatic flow matches the manual one several times does the manual one get switched off.",
    ],
    necesitas: [
      "That the systems you want connected <strong>have an API</strong>. If one doesn't, we find another route or we tell you it can't be done.",
      "The owner of the process: someone who can say “this is how it's done”.",
      "Test access to the systems, with scoped permissions.",
    ],
    limites: [
      "It isn't quoted over chat or by phone: it's studied first and quoted in writing.",
      "We don't promise integrations with specific brands before looking at them. Google Calendar and the WhatsApp API are included; the rest is confirmed in the consultation.",
      "We don't automate a process nobody can explain. If it isn't clear by hand, automating it only makes it faster to get wrong.",
    ],
    faq: [
      {
        p: "How much does it cost?",
        r: "It depends on the process, which is why there's no published range and the chat won't give you one. We look at the case in the free consultation and you get a written quote.",
      },
      {
        p: "Does it make sense for a small business?",
        r: "Yes, as long as there's a repetitive process eating hours. Company size matters less than how many times a day someone does the same thing.",
      },
      {
        p: "What if my system is old?",
        r: "We look at it. If it exposes an API, it gets connected. If it doesn't, sometimes there's another route and sometimes the honest answer is that it can't be done — and that's said in the consultation, not after invoicing.",
      },
    ],
    schema: {
      name: "Custom automation across systems",
      description:
        "Integration of CRM, ERP, spreadsheets, email and payment gateways into automatic flows that run repetitive tasks, validate data and notify exceptions.",
    },
  },

  {
    es: "sitios-web",
    slug: "websites",
    nav: "Websites",
    titulo: "Websites and landing pages with an AI agent",
    h1a: "A site that also",
    h1b: "answers.",
    tituloTag: "Website Design in Quito, Ecuador | Intellectum",
    descripcion:
      "Fast, measurable websites and landing pages with the AI agent built in from launch: visitors find an answer before they leave.",
    lead: "A pretty page that doesn't answer is an expensive brochure. We build sites that are fast, measurable and made for the visitor to do something — with the agent inside from day one, so anyone with a question resolves it there instead of leaving.",
    queEntrada:
      "It's a one-off payment, and the first month of the reception assistant is included. If you also want WhatsApp, the matching agent plan is added on top.",
    que: [
      "<strong>Genuinely fast</strong>: speed is the first thing Google looks at and the first thing anyone on a phone notices.",
      "<strong>With the agent inside</strong> from launch, not bolted on afterwards.",
      "<strong>Measurable</strong>: measurement is installed so you know where people arrive from and what they do, instead of spending on ads blind.",
      "<strong>Ready for search engines</strong>: clean URLs, structured data, a sitemap, and copy written for people.",
      "<strong>Yours</strong>: the domain is registered in your name and the site is handed over to you.",
    ],
    comoEntrada:
      "If you already have a site, it doesn't have to go: we keep it and integrate the AI on top. Building from scratch is only for people who don't have one or want to change it.",
    como: [
      "<strong>What it has to achieve.</strong> Before any talk of design: what the page is for and what should happen when someone lands on it.",
      "<strong>Structure and copy.</strong> We decide what goes in each section and write it; the copy is half the work.",
      "<strong>Build.</strong> Design, development, and the agent connected.",
      "<strong>Launch and measurement.</strong> It goes live, gets measured, and is corrected with real data.",
    ],
    necesitas: [
      "Your logo and your photos, if you have them; if not, we sort it out.",
      "Clarity on what you sell and to whom: without that, no copy works.",
      "The domain, registered <strong>in your name</strong> and paid by you, so the site is genuinely yours.",
    ],
    limites: [
      "No templates filled in with your logo.",
      "We don't promise a position on Google: we do what it takes to compete, and Google decides the position.",
      "Hosting and the domain in later years are on you.",
    ],
    faq: [
      {
        p: "Can I keep my current site and just add the agent?",
        r: "Yes, and it's the most common choice. We keep the site you have and integrate the AI on top of it.",
      },
      {
        p: "How long does it take?",
        r: "A simple landing page is a matter of days; a full site falls in the normal 2-to-6-week range.",
      },
      {
        p: "Can I edit it myself afterwards?",
        r: "Yes, it's handed over with what your team needs to change copy and images. Structural changes are better done with us.",
      },
    ],
    schema: {
      name: "Websites and landing pages with AI",
      description:
        "Development of fast, measurable, search-optimised websites and landing pages, with an artificial intelligence agent integrated from launch.",
    },
  },

  {
    es: "tiendas-en-linea",
    slug: "online-stores",
    nav: "Online stores",
    titulo: "Online stores for Ecuador",
    h1a: "A store that answers",
    h1b: "while you sleep.",
    tituloTag: "Online Stores with AI in Ecuador | Intellectum",
    descripcion:
      "Online stores with catalogue, cart and payments for Ecuador, with automated WhatsApp support and abandoned-cart recovery.",
    lead: "Selling online in Ecuador is more than uploading a catalogue: it's answering the question that stops the purchase, at the hour it gets asked. The store is built with the agent inside, so that question doesn't go unanswered.",
    queEntrada:
      "Catalogue, cart and payments is the minimum. What changes the outcome is what happens around the purchase:",
    que: [
      "<strong>Catalogue, cart and payments</strong> working with the payment methods people actually use here.",
      "<strong>The agent answering</strong>: sizes, availability, shipping, delivery times, returns — the questions that stall a purchase.",
      "<strong>Cart recovery</strong>: whoever left things behind gets written to.",
      "<strong>Order status over WhatsApp</strong>, which is where your customer is going to ask anyway.",
      "<strong>Measurement</strong> of what gets viewed, what gets added and where the purchase falls apart.",
    ],
    comoEntrada:
      "The store is designed phone-first, because that's where people buy in Ecuador. Whatever doesn't work on a six-inch screen doesn't work.",
    como: [
      "<strong>The catalogue.</strong> How your products are organised today and how they should be so people find them.",
      "<strong>Payments and shipping.</strong> Which payment methods you accept and how shipping is calculated.",
      "<strong>Build.</strong> Store, agent and measurement, together.",
      "<strong>Opening and tuning.</strong> It opens, we watch where the purchase falls apart, and we fix it.",
    ],
    necesitas: [
      "The catalogue: products, prices, photos and variants.",
      "How you charge: bank account, payment gateway, or both.",
      "How you ship: who carries it, to which areas, and in how long.",
      "Your tax ID and your sales and returns terms, which the store has to display.",
    ],
    limites: [
      "We don't sell third-party products or run your inventory: the store is yours and you operate it.",
      "Connecting a payment gateway or your inventory system is quoted separately, as an integration.",
      "We don't promise sales volume. The store removes friction; the product and the price are yours.",
    ],
    faq: [
      {
        p: "Does it work for selling over WhatsApp?",
        r: "Yes, and that's the norm here: the store shows the catalogue and the agent answers and closes the order over WhatsApp, where your customer already is.",
      },
      {
        p: "Which payment methods can be used?",
        r: "Bank transfer, deposit, and card through a payment gateway. Which one gets connected is decided with you, and that connection is quoted as an integration.",
      },
      {
        p: "Can I start with only a few products?",
        r: "Yes. In fact it's better: you open with your best sellers and expand once the operation runs smoothly.",
      },
    ],
    schema: {
      name: "Online stores with AI",
      description:
        "Development of online stores with catalogue, cart and payments for Ecuador, with automated WhatsApp support and abandoned-cart recovery.",
    },
  },
];
