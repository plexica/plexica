import { AuthLayout } from '../components/AuthLayout';
import { UsernameField } from '../components/UsernameField';
import '../styles/index.css';

import type { PageProps } from 'keycloakify/login/pages/PageProps';
import type { KcContext } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';

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
        <UsernameField
          realm={realm}
          msg={msg}
          defaultValue={auth.attemptedUsername ?? ''}
          autoFocus
          hasError={messagesPerField.existsError('username')}
        />

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
