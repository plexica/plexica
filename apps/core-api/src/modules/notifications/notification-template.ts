// File: apps/core-api/src/modules/notifications/notification-template.ts
// Spec 007 T007-10: Simple {{variable}} template engine for notifications
// FR-006: Render notification templates with data substitution

// ============================================================================
// Types
// ============================================================================

export interface NotificationTemplate {
  subject: string;
  body: string;
  htmlBody?: string;
}

// ============================================================================
// Template rendering
// ============================================================================

/**
 * Render a template string by substituting {{variableName}} tokens.
 * Missing keys are replaced with empty string (graceful degradation).
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

/**
 * Render all fields of a NotificationTemplate.
 */
export function renderNotificationTemplate(
  template: NotificationTemplate,
  data: Record<string, unknown>
): NotificationTemplate {
  return {
    subject: renderTemplate(template.subject, data),
    body: renderTemplate(template.body, data),
    htmlBody: template.htmlBody ? renderTemplate(template.htmlBody, data) : undefined,
  };
}

// ============================================================================
// Built-in templates (user-journey.md Journey 4)
// ============================================================================

export const NEW_LEAD_ASSIGNED: NotificationTemplate = {
  subject: 'New lead assigned: {{leadName}}',
  body: 'A new lead "{{leadName}}" has been assigned to you by {{assignedBy}}. View it at {{link}}.',
  htmlBody:
    '<p>A new lead <strong>{{leadName}}</strong> has been assigned to you by {{assignedBy}}.</p>' +
    '<p><a href="{{link}}">View lead →</a></p>',
};

export const DEAL_STATUS_CHANGED: NotificationTemplate = {
  subject: 'Deal "{{dealName}}" status changed to {{newStatus}}',
  body: 'The deal "{{dealName}}" has been updated from {{oldStatus}} to {{newStatus}} by {{changedBy}}. View it at {{link}}.',
  htmlBody:
    '<p>The deal <strong>{{dealName}}</strong> has been updated from <em>{{oldStatus}}</em> to <strong>{{newStatus}}</strong> by {{changedBy}}.</p>' +
    '<p><a href="{{link}}">View deal →</a></p>',
};

export const REPORT_READY: NotificationTemplate = {
  subject: 'Your report "{{reportName}}" is ready',
  body: 'Your report "{{reportName}}" has been generated and is ready for download. View it at {{link}}.',
  htmlBody:
    '<p>Your report <strong>{{reportName}}</strong> has been generated and is ready for download.</p>' +
    '<p><a href="{{link}}">Download report →</a></p>',
};
