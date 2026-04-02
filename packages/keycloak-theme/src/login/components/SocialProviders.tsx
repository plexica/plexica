import type { KcContext } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';

type LoginKcContext = Extract<KcContext, { pageId: 'login.ftl' }>;

type Props = {
  kcContext: LoginKcContext;
  i18n: I18n;
};

type SocialProvider = {
  providerId: string;
  loginUrl: string;
  displayName: string;
};

export function SocialProviders({ kcContext, i18n }: Props) {
  const { msg } = i18n;

  const providers =
    'social' in kcContext &&
    kcContext.social !== undefined &&
    'providers' in kcContext.social &&
    Array.isArray(kcContext.social.providers)
      ? (kcContext.social.providers as SocialProvider[])
      : [];

  if (providers.length === 0) {
    return null;
  }

  return (
    <>
      <div className="divider">{msg('identity-provider-login-label')}</div>
      <ul className="social-list">
        {providers.map((provider) => (
          <li key={provider.providerId}>
            <a href={provider.loginUrl} className="btn btn-ghost">
              {provider.displayName}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
