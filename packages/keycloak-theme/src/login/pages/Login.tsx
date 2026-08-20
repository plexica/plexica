import { useState } from 'react';

import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { SocialProviders } from '../components/SocialProviders';
import { UsernameField } from '../components/UsernameField';
import '../styles/index.css';

import type { FormEvent } from 'react';
import type { PageProps } from 'keycloakify/login/pages/PageProps';
import type { KcContext } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';

type LoginKcContext = Extract<KcContext, { pageId: 'login.ftl' }>;

type Props = PageProps<LoginKcContext, I18n>;

export default function Login({ kcContext, i18n }: Props) {
  const { realm, url, usernameHidden, login, auth, registrationDisabled, messagesPerField } =
    kcContext;

  const { msg, msgStr } = i18n;
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(_e: FormEvent<HTMLFormElement>) {
    setIsSubmitting(true);
  }

  const hasCredentialError = messagesPerField.existsError('username', 'password');

  return (
    <AuthLayout
      headerNode={
        <>
          <h1>{msg('loginAccountTitle')}</h1>
          {realm.password && realm.registrationAllowed && registrationDisabled !== true && (
            <p>
              {msg('noAccount')} <a href={url.registrationUrl}>{msg('doRegister')}</a>
            </p>
          )}
        </>
      }
    >
      {hasCredentialError && (
        <div className="alert alert-error" role="alert" aria-live="polite">
          <span>{messagesPerField.getFirstError('username', 'password')}</span>
        </div>
      )}

      <form action={url.loginAction} method="post" onSubmit={handleSubmit} noValidate>
        {!usernameHidden && (
          <UsernameField
            realm={realm}
            msg={msg}
            defaultValue={login.username ?? ''}
            autoFocus
            hasError={messagesPerField.existsError('username')}
            errorId="username-error"
            errorMessage={messagesPerField.getFirstError('username')}
          />
        )}

        <div className="form-group">
          <div className="label-row">
            <label className="form-label" htmlFor="password">
              {msg('password')}
            </label>
            {realm.resetPasswordAllowed && (
              <a href={url.loginResetCredentialsUrl} className="label-link">
                {msg('doForgotPassword')}
              </a>
            )}
          </div>
          <PasswordField
            id="password"
            name="password"
            hasError={messagesPerField.existsError('password')}
            errorId="password-error"
            ariaLabelShow={msgStr('showPassword')}
            ariaLabelHide={msgStr('hidePassword')}
          />
          {messagesPerField.existsError('password') && (
            <span id="password-error" className="form-error">
              {messagesPerField.getFirstError('password')}
            </span>
          )}
        </div>

        {realm.rememberMe && !usernameHidden && (
          <div className="checkbox-group">
            <input
              id="rememberMe"
              name="rememberMe"
              type="checkbox"
              defaultChecked={login.rememberMe === 'on'}
            />
            <label htmlFor="rememberMe">{msg('rememberMe')}</label>
          </div>
        )}

        <input type="hidden" name="credentialId" value={auth.selectedCredential} />

        <button
          type="submit"
          className={`btn btn-primary${isSubmitting ? ' btn-loading' : ''}`}
          disabled={isSubmitting}
        >
          {msgStr('doLogIn')}
        </button>
      </form>

      <SocialProviders kcContext={kcContext} i18n={i18n} />
    </AuthLayout>
  );
}
