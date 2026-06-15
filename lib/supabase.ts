// Supabase 서버 클라이언트 골격.
//
// **D-007: localStorage 사용 금지.**
// RuntimeLog / Fingerprint 는 이 제품의 해자 자산이다 (CLAUDE.md §6,
// DATA_MODEL.md §4). 클라이언트 로컬 스토리지에 두면 (a) 사용자가 기기를
// 바꾸는 순간 해자가 0으로 리셋되고, (b) 다른 사용자의 데이터와 가로질러
// 집단 부엌 지성을 만드는 P2 확장이 불가능해진다.
//
// 본 모듈은 서버 라우트 전용이다. "use client" 컴포넌트에서 import하면
// server-only 의존(lib/env.ts)이 빌드 타임에 에러를 던진다.
//
// service-role 키는 RLS 를 우회하므로 **반드시** 호출 직전에 user_id 검증
// (Authorization 헤더의 anon 토큰 검증 또는 세션 쿠키 검증)이 끝난 뒤에만
// 쓴다. 본 골격은 클라이언트 생성기까지만 두고, 실제 권한 모델은 P1 에서
// 라우트별로 명시한다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  supabaseAnonKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "./env";

let cachedAnon: SupabaseClient | null = null;

// 익명 권한(RLS 적용) 서버 클라이언트.
// Authorization 헤더로 사용자 토큰을 함께 보내야 RLS 가 user_id 매칭한다.
export function supabaseServerAnonClient(): SupabaseClient {
  if (cachedAnon) return cachedAnon;
  cachedAnon = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAnon;
}

let cachedService: SupabaseClient | null = null;

// service-role 클라이언트 (RLS 우회).
// 호출자는 user_id 검증이 끝났음을 보장해야 한다. 그렇지 않으면 한 사용자가
// 다른 사용자의 RuntimeLog/Fingerprint 를 갱신할 수 있다.
export function supabaseServerServiceRoleClient(): SupabaseClient {
  if (cachedService) return cachedService;
  cachedService = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedService;
}
