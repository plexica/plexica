import type { ReactNode } from 'react';
import type { I18n } from 'keycloakify/login/i18n';

type Props = {
  realm: {
    loginWithEmailAllowed: boolean;
    registrationEmailAsUsername: boolean;
  };
  msg: I18n['msg'];
  defaultValue: string;
  autoFocus?: boolean;
  hasError?: boolean;
  errorId?: string;
  errorMessage?: ReactNode;
};

/**
 * Username input with the shared label logic: username / usernameOrEmail /
 * email depending on the realm configuration. Optionally renders an inline
 * field error (pass errorId + errorMessage).
 */
export function UsernameField({
  realm,
  msg,
  defaultValue,
  autoFocus,
  hasError = false,
  errorId,
  errorMessage,
}: Props) {
  return (
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
        className={`form-input${hasError ? ' error' : ''}`}
        type="text"
        autoComplete="username"
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        aria-describedby={hasError && errorId !== undefined ? errorId : undefined}
      />
      {hasError && errorMessage !== undefined && (
        <span id={errorId} className="form-error">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
