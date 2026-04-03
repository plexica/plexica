import { useState } from 'react';

import { AuthLayout } from '../components/AuthLayout';
import { SocialProviders } from '../components/SocialProviders';
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
  const [passwordVisible, setPasswordVisible] = useState(false);

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
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              {!realm.loginWithEmailAllowed
                ? msg('username')
                : !realm.registrationEmailAsUsername
                  ? msg('usernameOrEmail')
                  : msg('email')}
            </label>
            <input
              id="username"
              name="username"
              className={`form-input${messagesPerField.existsError('username') ? ' error' : ''}`}
              type="text"
              autoComplete="username"
              autoFocus
              defaultValue={login.username ?? ''}
              aria-describedby={
                messagesPerField.existsError('username') ? 'username-error' : undefined
              }
            />
            {messagesPerField.existsError('username') && (
              <span id="username-error" className="form-error">
                {messagesPerField.getFirstError('username')}
              </span>
            )}
          </div>
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
          <div className="input-wrapper">
            <input
              id="password"
              name="password"
              className={`form-input${messagesPerField.existsError('password') ? ' error' : ''}`}
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              aria-describedby={
                messagesPerField.existsError('password') ? 'password-error' : undefined
              }
            />
            <button
              type="button"
              className="input-toggle"
              aria-label={passwordVisible ? msgStr('hidePassword') : msgStr('showPassword')}
              onClick={() => setPasswordVisible((v) => !v)}
            >
              {passwordVisible ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
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
