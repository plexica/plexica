// messages.it.notifications.ts — Notifiche: stringhe del dominio notifiche
// (features 006-01…006-05), incluse le chiavi di titolo persistite in
// notifications.title (risolte dalla UI via react-intl — la riga memorizza
// chiavi, non PII).

export const messagesItNotifications = {
  'notifications.bell.ariaLabel': 'Notifiche',
  'notifications.bell.title': 'Notifiche',
  'notifications.bell.empty': 'Non hai notifiche da leggere.',
  'notifications.bell.viewAll': 'Visualizza tutte',
  'notifications.markRead.ariaLabel': 'Segna come letta',

  'notifications.center.title': 'Notifiche',
  'notifications.center.markAllRead': 'Segna tutte come lette',
  'notifications.center.empty': 'Nessuna notifica',
  'notifications.center.empty.description':
    'Qui vedrai gli inviti ai workspace e le attività dei plugin in tempo reale.',
  'notifications.center.error': 'Impossibile caricare le notifiche.',

  'notifications.prefs.title': 'Preferenze notifiche',
  'notifications.prefs.loading': 'Caricamento preferenze...',
  'notifications.prefs.error': 'Impossibile caricare le preferenze notifiche.',
  'notifications.prefs.defaults.heading': 'Canali predefiniti',
  'notifications.prefs.types.heading': 'Canali per tipo',
  'notifications.prefs.types.empty': 'Nessun tipo di notifica disponibile.',
  'notifications.prefs.channel.inApp': 'In-app',
  'notifications.prefs.channel.email': 'Email',
  'notifications.prefs.save': 'Salva preferenze',
  'notifications.prefs.saved': 'Preferenze salvate',

  'notifications.workspace.invite.title': 'Sei stato invitato a un workspace',
  'notifications.workspace.invite.body': 'Entra nel workspace per iniziare a collaborare.',
  'notifications.plugin.crm.contact_created.title': 'Nuovo contatto: {name}',
} as const;