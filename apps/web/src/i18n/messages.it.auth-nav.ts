// messages.it.auth-nav.ts — Autenticazione, navigazione, dashboard e layout.
// Traduzioni italiane speculari a messages.en.auth-nav.ts (parità di chiavi).

export const messagesItAuthNav = {
  // Generici
  'app.name': 'Plexica',

  // Pagina di accesso (legacy — mantenuta per compatibilità smoke test)
  'login.title': 'Accedi a Plexica',
  'login.subtitle': 'Bentornato. Inserisci le tue credenziali per continuare.',
  'login.email.label': 'Indirizzo email',
  'login.email.placeholder': 'tu@esempio.com',
  'login.password.label': 'Password',
  'login.password.placeholder': '••••••••',
  'login.submit': 'Accedi',
  'login.loading': 'Accesso in corso…',

  // Callback di autenticazione
  'auth.callback.loading': 'Accesso in corso…',
  'auth.callback.error': 'Autenticazione non riuscita. Riprova.',
  'auth.callback.backToLogin': "Torna all'accesso",

  // Scadenza sessione
  'auth.session.expired': 'La tua sessione è scaduta.',
  'auth.session.redirecting': "Reindirizzamento all'accesso…",
  'auth.session.dismiss': 'Ignora',

  // Pagina di errore organizzazione
  'org.error.notFound.title': 'Organizzazione non trovata',
  'org.error.notFound.description':
    "Non riusciamo a trovare l'organizzazione che stai cercando. Controlla l'URL e riprova.",
  'org.error.noSubdomain.title': 'Quale organizzazione?',
  'org.error.noSubdomain.description':
    "Vai all'indirizzo della tua organizzazione per continuare.",
  'org.error.addressExample': 'Esempio: la-tua-org.plexica.io',
  'org.error.contactAdmin': 'Se hai bisogno di aiuto, contatta il tuo amministratore.',
  'org.error.visitSite': 'Visita plexica.io',

  // Navigazione
  'nav.dashboard': 'Dashboard',
  'nav.marketplace': 'Marketplace',
  'nav.plugins': 'Plugin',
  'nav.toggle': 'Attiva/disattiva barra laterale',
  'nav.search': 'Cerca',
  'nav.skipToContent': 'Salta al contenuto principale',
  'nav.primaryNavigation': 'Navigazione principale',
  'nav.sidebar': 'Barra laterale',
  'nav.sidebarDrawer': 'Navigazione',
  'nav.closeDrawer': 'Chiudi navigazione',
  'header.search.placeholder': 'Cerca…',
  'nav.workspaces': 'Workspace',
  'nav.users': 'Utenti',
  'nav.roles': 'Ruoli e autorizzazioni',
  'nav.settings': 'Impostazioni',
  'nav.auditLog': 'Registro di controllo',
  'nav.profile': 'Profilo',
  'nav.settings.general': 'Generale',
  'nav.settings.branding': 'Branding',
  'nav.settings.auth': 'Autenticazione',

  // Brand
  'brand.name': 'Plexica',

  // Dashboard
  'dashboard.greeting': 'Bentornato, {firstName}',
  'dashboard.stats.users': 'Utenti',
  'dashboard.stats.workspaces': 'Workspace',
  'dashboard.stats.plugins': 'Plugin',
  'dashboard.stats.storage': 'Archiviazione',
  'dashboard.activity.title': 'Attività recente',
  'dashboard.activity.empty.heading': 'Nessuna attività',
  'dashboard.activity.empty.description':
    'Le azioni eseguite in questo workspace compariranno qui.',

  // Error boundary
  'error.boundary.heading': 'Qualcosa è andato storto',
  'error.boundary.description':
    'Si è verificato un errore imprevisto. Prova ad aggiornare la pagina.',
  'error.boundary.goToDashboard': 'Vai alla Dashboard',
  'error.boundary.refresh': 'Aggiorna pagina',

  // Skeleton
  'skeleton.loading': 'Caricamento…',

  // Menu utente
  'user.menu.signOut': 'Esci',

  // Selettore lingua (006-07)
  'language.switcher.label': 'Lingua',
  'language.switcher.menu': 'Cambia lingua',
  'language.en': 'English',
  'language.it': 'Italiano',
} as const;