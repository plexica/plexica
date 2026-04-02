import { Suspense, lazy } from 'react';
import type { KcContext } from 'keycloakify/login/KcContext';
import DefaultPage from 'keycloakify/login/DefaultPage';
import Template from 'keycloakify/login/Template';
import UserProfileFormFields from 'keycloakify/login/UserProfileFormFields';
import { useI18n } from './i18n';

const LoginPage = lazy(() => import('./pages/Login'));
const LoginResetPasswordPage = lazy(() => import('./pages/LoginResetPassword'));
const LoginVerifyEmailPage = lazy(() => import('./pages/LoginVerifyEmail'));
const ErrorPage = lazy(() => import('./pages/Error'));

type Props = {
  kcContext: KcContext | undefined;
};

export function KcPage({ kcContext }: Props) {
  if (kcContext === undefined) {
    return <div>Keycloak context not available</div>;
  }

  return (
    <Suspense
      fallback={
        <div className="auth-root">
          <div className="auth-card" aria-busy="true" />
        </div>
      }
    >
      <KcPageSwitch kcContext={kcContext} />
    </Suspense>
  );
}

function KcPageSwitch({ kcContext }: { kcContext: KcContext }) {
  const { i18n } = useI18n({ kcContext });

  const commonProps = {
    i18n,
    Template,
    doUseDefaultCss: false,
  } as const;

  switch (kcContext.pageId) {
    case 'login.ftl':
      return <LoginPage kcContext={kcContext} {...commonProps} />;
    case 'login-reset-password.ftl':
      return <LoginResetPasswordPage kcContext={kcContext} {...commonProps} />;
    case 'login-verify-email.ftl':
      return <LoginVerifyEmailPage kcContext={kcContext} {...commonProps} />;
    case 'error.ftl':
      return <ErrorPage kcContext={kcContext} {...commonProps} />;
    default:
      return (
        <DefaultPage
          kcContext={kcContext}
          i18n={i18n}
          Template={Template}
          doUseDefaultCss={true}
          UserProfileFormFields={UserProfileFormFields}
          doMakeUserConfirmPassword={true}
        />
      );
  }
}
