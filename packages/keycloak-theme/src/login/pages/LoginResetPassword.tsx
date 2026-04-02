import type { PageProps } from 'keycloakify/login/pages/PageProps';
import type { KcContext } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';
import { AuthLayout } from '../components/AuthLayout';
import '../styles/index.css';

type ResetPasswordKcContext = Extract<KcContext, { pageId: 'login-reset-password.ftl' }>;

type Props = PageProps<ResetPasswordKcContext, I18n>;

export default function LoginResetPassword({ kcContext, i18n }: Props) {
  const { url, realm, auth, messagesPerField } = kcContext;
  const { msg, msgStr } = i18n;

  return (
    <AuthLayout
      headerNode={
        <>
          <h1>{msg('emailForgotTitle')}</h1>
          <p>{msg('emailInstruction')}</p>
        </>
      }
    >
      {messagesPerField.existsError('username') && (
        <div className="alert alert-error" role="alert">
          <span>{messagesPerField.getFirstError('username')}</span>
        </div>
      )}

      <form action={url.loginAction} method="post">
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
            type="text"
            className={`form-input${messagesPerField.existsError('username') ? ' error' : ''}`}
            autoFocus
            autoComplete="username"
            defaultValue={auth.attemptedUsername ?? ''}
          />
        </div>

        <button type="submit" className="btn btn-primary">
          {msgStr('doSubmit')}
        </button>
      </form>

      <div className="auth-footer">
        <a href={url.loginUrl}>{msg('backToLogin')}</a>
      </div>
    </AuthLayout>
  );
}
