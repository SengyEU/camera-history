export interface Rfc7807Error {
  type: string;
  title: string;
  status: number;
  detail: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  constructor(status: number, title: string, detail: string) {
    super(detail);
    this.name = "HttpError";
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export function rfc7807(status: number, title: string, detail: string): Rfc7807Error {
  return { type: "about:blank", title, status, detail };
}