import https from "node:https";
import type { LcuCredentials } from "./lockfile.js";

export const LCU_HOST = "127.0.0.1";

export class LcuError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "LcuError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Minimal HTTP client for the League Client Update API.
 *
 * The client serves a self-signed certificate, so verification is disabled.
 * This is safe only because requests are always sent to 127.0.0.1.
 */
export class LcuHttpClient {
  private readonly agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
  private readonly authorization: string;

  constructor(readonly credentials: LcuCredentials) {
    this.authorization = basicAuth(credentials.password);
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);

    return new Promise<T>((resolve, reject) => {
      const req = https.request(
        {
          host: LCU_HOST,
          port: this.credentials.port,
          path,
          method,
          agent: this.agent,
          headers: {
            Authorization: this.authorization,
            Accept: "application/json",
            ...(payload !== undefined && {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const data = parseBody(text);
            const status = res.statusCode ?? 0;

            if (status >= 200 && status < 300) {
              resolve(data as T);
            } else {
              const message =
                (data as { message?: string } | undefined)?.message ?? `HTTP ${status}`;
              reject(new LcuError(status, `${method} ${path} failed: ${message}`, data));
            }
          });
          res.on("error", reject);
        },
      );

      req.setTimeout(10_000, () => req.destroy(new Error(`${method} ${path} timed out`)));
      req.on("error", reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  }

  dispose(): void {
    this.agent.destroy();
  }
}

export function basicAuth(password: string): string {
  return `Basic ${Buffer.from(`riot:${password}`).toString("base64")}`;
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
