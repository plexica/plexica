import { useState } from 'react';

import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import '../styles/index.css';

import type { FormEvent } from 'react';
import type { PageProps } from 'keycloakify/login/pages/PageProps';
import type { KcContext } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';

type UpdatePasswordKcContext = Extract<KcContext, { pageId: 'login-update-password.ftl' }>;

type Props = PageProps<UpdatePasswordKcContext, I18n>;

export default function LoginUpdatePassword({ kcContext, i18n }: Props) {
  const { url, messagesPerField } = kcContext;
  const { msg, msgStr } = i18n;
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(_e: FormEvent<HTMLFormElement>) {
    setIsSubmitting(true);
  }

  const showLabel = msgStr('showPassword');
  const hideLabel = msgStr('hidePassword');

  return (
    <AuthLayout headerNode={<h1>{msg('updatePasswordTitle')}</h1>}>
      <form action={url.loginAction} method="post" onSubmit={handleSubmit} noValidate>
        {/* Hidden username for password manager association (WCAG technique) */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          className="sr-only"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />

        <div className="form-group">
          <label className="form-label required" htmlFor="password-new">
            {msg('passwordNew')}
          </label>
          <PasswordField
            id="password-new"
            name="password-new"
            autoComplete="new-password"
            autoFocus
            hasError={messagesPerField.existsError('password-new', 'password')}
            errorId="password-new-error"
            ariaLabelShow={showLabel}
            ariaLabelHide={hideLabel}
          />
          {messagesPerField.existsError('password-new', 'password') && (
            <span id="password-new-error" className="form-error" role="alert">
              {messagesPerField.getFirstError('password-new', 'password')}
            </span>
          )}
        </div>

        <div className="form-group">
          <label className="form-label required" htmlFor="password-confirm">
            {msg('passwordConfirm')}
          </label>
          <PasswordField
            id="password-confirm"
            name="password-confirm"
            autoComplete="new-password"
            hasError={messagesPerField.existsError('password-confirm')}
            errorId="password-confirm-error"
            ariaLabelShow={showLabel}
            ariaLabelHide={hideLabel}
          />
          {messagesPerField.existsError('password-confirm') && (
            <span id="password-confirm-error" className="form-error" role="alert">
              {messagesPerField.getFirstError('password-confirm')}
            </span>
          )}
        </div>

        <button
          type="submit"
          className={`btn btn-primary${isSubmitting ? ' btn-loading' : ''}`}
          disabled={isSubmitting}
        >
          {msgStr('doSubmit')}
        </button>
      </form>
    </AuthLayout>
  );
}
