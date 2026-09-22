// messages.it.settings-common.ts — Impostazioni, profilo, registro di controllo,
// stringhe comuni e stati vuoti. Speculare a messages.en.settings-common.ts.

export const messagesItSettingsCommon = {
  // Impostazioni — feedback
  'settings.unsavedChanges': 'Modifiche non salvate',
  'settings.saved': 'Salvato',

  // Impostazioni — pagine
  'settings.general.title': 'Impostazioni generali',
  'settings.general.displayName.description':
  "Questo nome viene mostrato nell'header e nelle email.",
  'settings.general.displayName.label': 'Nome organizzazione',
  'settings.general.slug.label': 'Slug organizzazione',
  'settings.general.slug.tooltip': "Lo slug non può essere modificato dopo la creazione.",
  'settings.general.save': 'Salva',
  'settings.branding.title': 'Branding',
  'settings.branding.logo.label': 'Logo',
  // {maxMb} / {formats} derivano da LOGO_UPLOAD (services/settings-api.ts):
  // mai ripeterli nel testo.
  'settings.branding.logo.description':
    "Mostrato nell'header e nella pagina di accesso. Max {maxMb} MB. {formats}.",
  'settings.branding.appearance.title': 'Aspetto',
  'settings.branding.appearance.description':
    "Personalizza il tema colore della tua organizzazione.",
  'settings.branding.primaryColor.label': 'Colore primario',
  'settings.branding.darkMode.label': 'Modalità scura',
  'settings.branding.save': 'Salva',
  'settings.auth.title': 'Autenticazione',
  'settings.auth.description':
    'Configura le impostazioni di sicurezza del realm Keycloak.',
  'settings.auth.bruteForce.label': 'Protezione da forza bruta',
  'settings.auth.sessionLifespan.label': 'Durata sessione (secondi)',
  'settings.auth.save': 'Salva',

  // Profilo
  'profile.title': 'Profilo',
  // {maxMb} / {formats} derivano da AVATAR_UPLOAD (services/profile-api.ts).
  'profile.avatar.description': 'Carica una foto. Max {maxMb} MB. {formats}.',
  'profile.displayName.label': 'Nome visualizzato',
  'profile.timezone.label': 'Fuso orario',
  'profile.language.label': 'Lingua',
  'profile.avatar.label': 'Avatar',
  'profile.save': 'Salva',

  // Registro di controllo
  'auditLog.title': 'Registro di controllo',
  'auditLog.filter.actor': 'Attore',
  'auditLog.filter.action': 'Tipo di azione',
  'auditLog.filter.allActions': 'Tutte le azioni',
  'auditLog.filter.dateRange': 'Intervallo di date',
  'auditLog.filter.workspace': 'Workspace',
  'auditLog.filter.from': 'Da',
  'auditLog.filter.to': 'A',
  'auditLog.table.actor': 'Attore',
  'auditLog.table.action': 'Azione',
  'auditLog.table.target': 'Risorsa',
  'auditLog.table.workspace': 'Workspace',
  'auditLog.table.time': 'Ora',
  'auditLog.empty': 'Nessuna voce nel registro di controllo.',

  // Comuni
  'common.cancel': 'Annulla',
  'common.confirm': 'Conferma',
  'common.save': 'Salva',
  'common.delete': 'Elimina',
  'common.restore': 'Ripristina',
  'common.edit': 'Modifica',
  'common.retry': 'Riprova',
  'common.none': 'Nessuno',
  'common.select.placeholder': 'Seleziona\u2026',
  'common.loading': 'Caricamento\u2026',
  'common.error': 'Si è verificato un errore.',
  'common.noData': 'Nessun dato.',
  'common.search': 'Cerca',
  'common.filter': 'Filtra',
  'common.status': 'Stato',
  'common.actions': 'Azioni',
  'common.page': 'Pagina {page} di {total}',
  'common.prevPage': 'Pagina precedente',
  'common.nextPage': 'Pagina successiva',

  // Stato di errore a livello pagina (componente PageError)
  'error.page.heading': 'Caricamento non riuscito',
  'error.page.description': "Si è verificato un errore durante il caricamento della pagina.",

  // Errori di upload — mostrati accanto al controllo FileUpload.
  // Risolti da ApiError.code via i18n/upload-messages.ts.
  'upload.error.tooLarge': 'Il file è troppo grande. La dimensione massima è {maxMb} MB.',
  'upload.error.invalidType': 'Tipo di file non supportato. Formati consentiti: {formats}.',
  'upload.error.invalidFile': 'Impossibile accettare il file. Scegline un altro.',
  'upload.error.rateLimited': 'Troppi upload in poco tempo. Attendi e riprova.',
  'upload.error.forbidden': 'Non hai il permesso di caricare questo file.',
  'upload.error.server': 'Upload non riuscito a causa di un errore del server. Riprova.',
  'upload.error.invalidResponse': 'Il server ha restituito una risposta inattesa. Riprova.',
  'upload.error.generic': 'Upload non riuscito. Riprova.',

  // Stati vuoti (per pagina)
  'users.list.empty': 'Nessun utente',
  'users.list.empty.description':
    'Gli utenti aggiunti a questa organizzazione compariranno qui.',
  'workspace.templates.empty': 'Nessun modello',
  'workspace.templates.empty.description':
    'I modelli di workspace non sono ancora stati configurati.',
  'workspace.members.empty': 'Nessun membro',
  'workspace.members.empty.description':
    "Invita utenti per concedere loro l'accesso a questo workspace.",
  'workspace.children.empty': 'Nessun sotto-workspace',
  'workspace.children.empty.description':
    'I sotto-workspace creati sotto questo workspace compariranno qui.',

  // Override delle traduzioni (006-10)
  'translations.title': 'Traduzioni',
  'translations.description':
    'Sostituisci le stringhe dell\'interfaccia a livello di tenant. Precedenza: override > plugin > core.',
  'translations.overrides.heading': 'Override attivi',
  'translations.loading': 'Caricamento traduzioni...',
  'translations.error': 'Impossibile caricare le traduzioni.',
  'translations.empty': 'Nessun override configurato. Le stringhe predefinite restano attive.',
  'translations.key.label': 'Chiave messaggio',
  'translations.value.label': 'Valore ({locale})',
  'translations.locale.en': 'English',
  'translations.locale.it': 'Italiano',
  'translations.save': 'Salva',
  'translations.add': 'Aggiungi override',
  'translations.revert': 'Ripristina',
  'translations.revert.confirm': 'Ripristinare l\'override?',
  'translations.revert.confirm.description':
    'La stringa predefinita ({locale} default) tornerà attiva.',
  'translations.saved': 'Override salvato',
  'translations.reverted': 'Override ripristinato',
  'translations.notAdmin':
    'Solo gli amministratori del tenant possono modificare le traduzioni.',
  'translations.key.invalid': 'Inserisci una chiave valida (es. common.save).',
} as const;