import "server-only";

import { supabaseServerAnonClient } from "@/lib/supabase";

export type AuthOk = {
  ok: true;
  userId: string;
  token: string;
};

export type AuthFailed = {
  ok: false;
  response: Response;
};

export type AuthResult = AuthOk | AuthFailed;

export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const auth =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: jsonResponse(401, {
        error: "missing_authorization",
        message: "로그인이 필요합니다.",
      }),
    };
  }

  const token = auth.slice("bearer ".length).trim();
  if (token.length === 0) {
    return {
      ok: false,
      response: jsonResponse(401, {
        error: "missing_token",
        message: "로그인이 필요합니다.",
      }),
    };
  }

  const supabase = supabaseServerAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: jsonResponse(401, {
        error: "invalid_token",
        message: "세션이 만료됐어요. 다시 로그인 해주세요.",
      }),
    };
  }

  return { ok: true, userId: data.user.id, token };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
