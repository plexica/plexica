import type { PageProps } from 'keycloakify/login/pages/PageProps';
import type { KcContext } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';
import { AuthLayout } from '../components/AuthLayout';
import '../styles/index.css';

type ErrorKcContext = Extract<KcContext, { pageId: 'error.ftl' }>;

type Props = PageProps<ErrorKcContext, I18n>;

export default function Error({ kcContext, i18n }: Props) {
  const { message, client } = kcContext;
  const { msg } = i18n;

  const hasClientUrl = client !== undefined && 'baseUrl' in client && client.baseUrl !== undefined;

  return (
    <AuthLayout headerNode={<h1>{msg('errorTitle')}</h1>}>
      <div className="alert alert-error" role="alert">
        <span>{message.summary}</span>
      </div>
      {hasClientUrl && (
        <div className="auth-footer">
          <a href={(client as { baseUrl: string }).baseUrl} className="btn btn-ghost">
            {msg('backToApplication')}
          </a>
        </div>
      )}
    </AuthLayout>
  );
}
