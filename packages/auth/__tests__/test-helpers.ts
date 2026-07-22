export class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export function makeAccessToken(): string {
  const payload = btoa(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'user-1',
      email: 'admin@example.com',
      given_name: 'Admin',
      family_name: 'User',
      realm_access: { roles: ['admin'] },
    })
  ).replace(/=/g, '');
  return `header.${payload}.signature`;
}

export function tokenResponse(idToken?: string) {
  return {
    access_token: makeAccessToken(),
    refresh_token: 'refresh-new',
    ...(idToken === undefined ? {} : { id_token: idToken }),
    expires_in: 60,
    refresh_expires_in: 600,
    token_type: 'Bearer' as const,
  };
}
