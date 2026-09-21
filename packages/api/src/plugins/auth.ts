import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@ch/core";
import { rfc7807 } from "@ch/core";

const ACCESS_COOKIE = "ch_access";
const REFRESH_COOKIE = "ch_refresh";

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  role: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub?: string; tenantId: string; email: string; role: string; kind: "access" | "refresh" };
    user: AuthUser;
  }
}

export function setCookies(reply: FastifyReply, cfg: AppConfig, access: string, refresh: string) {
  const base = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: false };
  reply.setCookie(ACCESS_COOKIE, access, { ...base, maxAge: cfg.jwt.accessTtlSeconds });
  reply.setCookie(REFRESH_COOKIE, refresh, { ...base, maxAge: cfg.jwt.refreshTtlSeconds });
}

export function clearCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { path: "/" });
}

export function getAccessToken(req: FastifyRequest): string | null {
  const token = req.cookies[ACCESS_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function getRefreshToken(req: FastifyRequest): string | null {
  const token = req.cookies[REFRESH_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function requireAuth(app: FastifyInstance) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = getAccessToken(req);
    if (!token) {
      return reply.code(401).type("application/problem+json").send(rfc7807(401, "unauthorized", "missing access token"));
    }
    try {
      const payload = app.jwt.verify<{ sub?: string; tenantId: string; email: string; role: string; kind: string }>(token);
      if (payload.kind !== "access") throw new Error("not access token");
      req.user = {
        id: payload.sub ?? "",
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role as string,
      };
    } catch {
      return reply.code(401).type("application/problem+json").send(rfc7807(401, "unauthorized", "invalid access token"));
    }
  };
}