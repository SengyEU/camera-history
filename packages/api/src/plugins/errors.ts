import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { HttpError, rfc7807 } from "@ch/core";

export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  if (err instanceof HttpError) {
    if (err.status >= 500) req.log.error(err);
    void reply
      .status(err.status)
      .type("application/problem+json")
      .send(rfc7807(err.status, err.title, err.detail));
    return;
  }

  const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  const detail = status >= 500 ? "Internal Server Error" : err.message;
  void reply
    .status(status)
    .type("application/problem+json")
    .send(rfc7807(status, "error", detail));
}