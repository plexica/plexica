// messages.it.workspace-users.ts — Workspace, membri, utenti e ruoli.
// Traduzioni italiane speculari a messages.en.workspace-users.ts.

export const messagesItWorkspaceUsers = {
  // Workspace
  'workspace.list.title': 'Workspace',
  'workspace.list.empty': 'Nessun workspace',
  'workspace.create.title': 'Crea workspace',
  'workspace.create.name.label': 'Nome',
  'workspace.create.description.label': 'Descrizione',
  'workspace.create.parent.label': 'Workspace padre',
  'workspace.create.template.label': 'Modello',
  'workspace.create.submit': 'Crea',
  'workspace.edit.title': 'Modifica workspace',
  'workspace.edit.submit': 'Salva modifiche',
  'workspace.delete.confirm.title': 'Archivia workspace',
  'workspace.delete.confirm.description':
    'Il workspace e tutti i suoi figli verranno archiviati. Potranno essere ripristinati entro 30 giorni.',
  'workspace.restore.confirm.title': 'Ripristina workspace',
  'workspace.restore.confirm.description':
    'Il workspace e i suoi figli verranno ripristinati.',
  'workspace.status.active': 'Attivo',
  'workspace.status.archived': 'Archiviato',
  'workspace.detail.parent': 'Workspace padre:',
  'workspace.detail.members': 'Membri',
  'workspace.detail.children': 'Sotto-workspace',
  'workspace.reparent.label': 'Sposta in',
  'workspace.dangerZone.title': 'Zona pericolosa',
  'workspace.tree.label': 'Gerarchia workspace',
  'workspace.tree.empty': 'Nessun workspace.',
  'workspace.tree.expand': 'Espandi {name}',
  'workspace.tree.collapse': 'Comprimi {name}',
  'workspace.tree.search.label': 'Cerca workspace',
  'workspace.tree.search.placeholder': 'Cerca workspace...',
  'workspace.tree.search.results':
    '{count, plural, one {# workspace trovato} other {# workspace trovati}}',
  'workspace.tree.search.empty': 'Nessun workspace corrisponde alla ricerca.',
  'workspace.tree.noParent': 'Nessun workspace padre',
  'workspace.selector.label': 'Selettore workspace: {name}',
  'workspace.selector.viewAll': 'Visualizza tutti i workspace',

  // Membri
  'members.title': 'Membri',
  'members.add': 'Aggiungi membro',
  'members.invite': 'Invita tramite email',
  'members.remove.confirm.title': 'Rimuovi membro',
  'members.remove.confirm.description':
    "Questo membro perderà l'accesso a questo workspace.",
  'members.role.admin': 'Amministratore',
  'members.role.member': 'Membro',
  'members.role.viewer': 'Visualizzatore',
  'members.role.aria': 'Ruolo per {name}',
  'members.remove.aria': 'Rimuovi {name}',
  'members.invitation.pending': 'Invito in sospeso',
  'members.invitation.resend': 'Reinvia',

  // Utenti
  'users.title': 'Utenti',
  'users.search.placeholder': 'Cerca utenti\u2026',
  'users.remove.title': 'Rimuovi utente',
  'users.remove.description': 'Questo utente verrà rimosso dal tenant.',
  'users.remove.confirm.instructions': 'Digita CONFERMA per rimuovere definitivamente questo utente',
  'users.remove.reassign.label': 'Assegna i contenuti a',
  'users.remove.ariaLabel': 'Rimuovi {name}',
  'users.status.active': 'Attivo',
  'users.status.invited': 'Invitato',
  'users.status.disabled': 'Disabilitato',

  // Ruoli
  'roles.title': 'Ruoli e autorizzazioni',
  'roles.matrix.title': 'Matrice delle autorizzazioni',
  'roles.export.csv': 'Esporta CSV',
  'roles.matrix.adminTenant': 'Amministratore (Tenant)',
  'roles.matrix.adminWorkspace': 'Amministratore (WS)',
  'roles.actionCount': '{count} azioni',
  'roles.scope.tenant': 'Tenant',
  'roles.scope.workspace': 'Workspace',

  // Stato workspace
  'workspace.status.all': 'Tutti gli stati',
} as const;