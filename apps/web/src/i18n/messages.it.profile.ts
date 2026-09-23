// messages.it.profile.ts — Profilo: stringhe del dominio profilo
// (features 006-11…006-14). Solo le nuove chiavi della Fase 5 (email,
// sessioni, password, origine avatar); le chiavi `profile.*` preesistenti
// restano nel dominio settings-common.

export const messagesItProfile = {
  // Email (006-11)
  'profile.email.label': 'Email',
  'profile.email.error': 'Inserisci un indirizzo email valido.',

  // Errore di validazione del nome visualizzato (006-11).
  'profile.displayName.error': 'Inserisci un nome visualizzato (1–120 caratteri).',

  // Errore di salvataggio (006-11) — mostrato dallo stato isError della mutation.
  'profile.save.error': 'Impossibile salvare il profilo. Riprova.',

  // Sessioni (006-13)
  'profile.sessions.title': 'Sessioni attive',
  'profile.sessions.description': 'Dispositivi e browser attualmente collegati al tuo account.',
  'profile.sessions.empty': 'Nessuna sessione attiva.',
  'profile.sessions.error': 'Impossibile caricare le sessioni.',
  'profile.sessions.revokeError': 'Impossibile revocare la sessione. Riprova.',
  'profile.sessions.current': 'Sessione corrente',
  'profile.sessions.revoke': 'Revoca',
  'profile.sessions.lastSeen': 'Ultimo accesso {date}',

  // Password (006-14)
  'profile.password.title': 'Password',
  'profile.password.description': 'Le password sono gestite nella console account Keycloak.',
  'profile.password.button': 'Cambia password',

  // Origine avatar (006-12)
  'profile.avatar.source.keycloak': 'Avatar fornito dal tuo identity provider.',
  'profile.avatar.source.upload': 'Avatar caricato.',
} as const;
