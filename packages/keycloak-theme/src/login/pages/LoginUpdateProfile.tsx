import { useState } from 'react';

import { AuthLayout } from '../components/AuthLayout';
import '../styles/index.css';

import type { FormEvent } from 'react';
import type { PageProps } from 'keycloakify/login/pages/PageProps';
import type { KcContext, Attribute } from 'keycloakify/login/KcContext';
import type { I18n } from 'keycloakify/login/i18n';

type UpdateProfileKcContext = Extract<KcContext, { pageId: 'login-update-profile.ftl' }>;

type Props = PageProps<UpdateProfileKcContext, I18n>;

function inputTypeFor(attribute: Attribute): string {
  const annotated = attribute.annotations?.inputType;
  if (annotated === 'email' || attribute.name === 'email') return 'email';
  if (annotated === 'tel') return 'tel';
  if (annotated === 'url') return 'url';
  return 'text';
}

export default function LoginUpdateProfile({ kcContext, i18n }: Props) {
  const { url, profile, messagesPerField } = kcContext;
  const { msg, msgStr, advancedMsgStr } = i18n;
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(_e: FormEvent<HTMLFormElement>) {
    setIsSubmitting(true);
  }

  const attributes = Object.values(profile.attributesByName);

  return (
    <AuthLayout headerNode={<h1>{msg('loginProfileTitle')}</h1>}>
      <form action={url.loginAction} method="post" onSubmit={handleSubmit} noValidate>
        {attributes.map((attribute) => {
          const hasError = messagesPerField.existsError(attribute.name);
          const errorId = `${attribute.name}-error`;
          const labelText = advancedMsgStr(attribute.displayName ?? attribute.name);

          return (
            <div className="form-group" key={attribute.name}>
              <label
                className={`form-label${attribute.required ? ' required' : ''}`}
                htmlFor={attribute.name}
              >
                {labelText}
              </label>
              <input
                id={attribute.name}
                name={attribute.name}
                type={inputTypeFor(attribute)}
                autoComplete={attribute.autocomplete ?? 'off'}
                defaultValue={attribute.value ?? ''}
                readOnly={attribute.readOnly}
                aria-required={attribute.required}
                aria-describedby={hasError ? errorId : undefined}
                className={`form-input${attribute.readOnly ? ' readonly' : ''}${hasError ? ' error' : ''}`}
              />
              {hasError && (
                <span id={errorId} className="form-error" role="alert">
                  {messagesPerField.getFirstError(attribute.name)}
                </span>
              )}
            </div>
          );
        })}

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
