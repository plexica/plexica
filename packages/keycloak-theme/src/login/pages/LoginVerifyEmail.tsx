import type { PageProps } from 'keycloakify/login/pages/PageProps';
import type { KcContext } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';
import { AuthLayout } from '../components/AuthLayout';
import '../styles/index.css';

type VerifyEmailKcContext = Extract<KcContext, { pageId: 'login-verify-email.ftl' }>;

type Props = PageProps<VerifyEmailKcContext, I18n>;

export default function LoginVerifyEmail({ kcContext, i18n }: Props) {
  const { url, user } = kcContext;
  const { msg, msgStr } = i18n;

  return (
    <AuthLayout headerNode={<h1>{msg('emailVerifyTitle')}</h1>}>
      <p className="verify-instruction">{msg('emailVerifyInstruction1', user?.email ?? '')}</p>
      <p className="verify-resend">
        {msg('emailVerifyInstruction2')}{' '}
        <a href={url.loginAction} className="verify-resend-link" aria-label={msgStr('doClickHere')}>
          {msg('doClickHere')}
        </a>{' '}
        {msg('emailVerifyInstruction3')}
      </p>
    </AuthLayout>
  );
}
