import {
  authMeResponseSchema,
  authResponseSchema,
  type AuthUser,
} from '@dnd/protocol';

import { runtimeServerUrl } from './runtime-api';

export type AuthApiResult =
  | {
      ok: true;
      user: AuthUser | null;
    }
  | {
      message: string;
      ok: false;
    };

export async function getCurrentAuthUser(): Promise<AuthApiResult> {
  return requestAuth('/api/auth/me', undefined, true);
}

export async function loginAuth(params: {
  email: string;
  password: string;
}): Promise<AuthApiResult> {
  return requestAuth('/api/auth/login', params, false);
}

export async function registerAuth(params: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AuthApiResult> {
  return requestAuth('/api/auth/register', params, false);
}

export async function logoutAuth(): Promise<AuthApiResult> {
  return requestAuth('/api/auth/logout', {}, true);
}

async function requestAuth(
  path: string,
  body: unknown,
  allowNullableUser: boolean,
): Promise<AuthApiResult> {
  let response: Response;

  try {
    response = await fetch(new URL(path, runtimeServerUrl), {
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      headers:
        body === undefined
          ? undefined
          : {
              'content-type': 'application/json',
            },
      method: body === undefined ? 'GET' : 'POST',
    });
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'ارتباط با سرور برقرار نشد.',
      ok: false,
    };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return {
      message: `سرور پاسخ JSON معتبر برنگرداند. کد ${response.status}`,
      ok: false,
    };
  }

  const parsed = (
    allowNullableUser ? authMeResponseSchema : authResponseSchema
  ).safeParse(payload);

  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? 'شکل پاسخ auth نامعتبر بود.',
      ok: false,
    };
  }

  if (!parsed.data.ok) {
    return {
      message: parsed.data.error.message,
      ok: false,
    };
  }

  return {
    ok: true,
    user: parsed.data.data.user,
  };
}
