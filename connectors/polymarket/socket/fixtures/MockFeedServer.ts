/**
 * A real loopback WebSocket server for socket tests, built on
 * `@tundralibs/compat/websocket` so the same test runs on Deno, Bun and
 * Node (Node's server side needs the `ws` dev dependency; the client under
 * test still uses only the global `WebSocket`).
 *
 * VENDORED next to `FeedSocket.ts` — keep every copy identical.
 */
import { WebSocketServer } from '@wss';
import { getFreePort } from '@utils';

type Conn = { id: number; headers: Record<string, string>; path: string };

/** One accepted client connection, as the server sees it. */
export class MockConnection {
  /** Text frames received from the client, in order. */
  public readonly received: string[] = [];
  /** Handshake request headers (lower-cased names). */
  public readonly headers: Record<string, string>;
  /** Request path + query of the handshake. */
  public readonly path: string;
  public closed = false;
  public closeCode?: number;
  #ws: { send(data: string): void; close(code?: number, reason?: string): void };
  #waiters: (() => void)[] = [];

  constructor(
    ws: { send(data: string): void; close(code?: number, reason?: string): void },
    conn: Conn,
  ) {
    this.#ws = ws;
    this.headers = conn.headers;
    this.path = conn.path;
  }

  /** Push one text frame (objects are JSON-encoded). */
  send(frame: unknown): void {
    this.#ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  /** Close from the server side. */
  close(code = 1000, reason = ''): void {
    this.#ws.close(code, reason);
  }

  /** Received frames parsed as JSON (non-JSON frames are skipped). */
  json(): unknown[] {
    return this.received.flatMap((t) => {
      try {
        return [JSON.parse(t)];
      } catch {
        return [];
      }
    });
  }

  /** Resolve once a received frame satisfies `match`; returns it. */
  async waitFor(
    match: (frame: string) => boolean,
    timeoutMs = 3_000,
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.received.find(match);
      if (hit !== undefined) return hit;
      if (Date.now() > deadline) {
        throw new Error(
          `no matching frame within ${timeoutMs}ms; got ${
            JSON.stringify(this.received)
          }`,
        );
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 20);
        this.#waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** @internal */
  _push(text: string): void {
    this.received.push(text);
    const waiters = this.#waiters.splice(0);
    for (const w of waiters) w();
  }
}

/** Loopback server; one instance per test. */
export class MockFeedServer {
  public readonly connections: MockConnection[] = [];
  /** Answer the next N handshakes with this HTTP status instead of upgrading. */
  public refuseWith?: { status: number; times: number };
  readonly #wss: WebSocketServer<Conn>;
  readonly #port: number;
  #nextId = 0;
  #byId = new Map<number, MockConnection>();

  private constructor(wss: WebSocketServer<Conn>, port: number) {
    this.#wss = wss;
    this.#port = port;
  }

  /** `ws://127.0.0.1:<port>` plus `path`. */
  url(path = '/'): string {
    return `ws://127.0.0.1:${this.#port}${path}`;
  }

  /** `http://127.0.0.1:<port>` — for fetch-based probes. */
  get httpOrigin(): string {
    return `http://127.0.0.1:${this.#port}`;
  }

  static async start(): Promise<MockFeedServer> {
    let server: MockFeedServer | undefined;
    const wss = new WebSocketServer<Conn>({
      upgrade: (req) => {
        const refuse = server?.refuseWith;
        if (refuse && refuse.times > 0) {
          refuse.times -= 1;
          return false;
        }
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          headers[k] = v;
        });
        const u = new URL(req.url);
        return {
          data: { id: ++server!.#nextId, headers, path: u.pathname + u.search },
        };
      },
    });
    const port = await getFreePort();
    server = new MockFeedServer(wss, port);
    wss.onOpen((ws) => {
      const conn = new MockConnection(ws, ws.data);
      server!.#byId.set(ws.data.id, conn);
      server!.connections.push(conn);
    });
    wss.onMessage((ctx) => {
      server!.#byId.get(ctx.ws.data.id)?._push(String(ctx.message));
    });
    wss.onClose((ws, code) => {
      const conn = server!.#byId.get(ws.data.id);
      if (conn) {
        conn.closed = true;
        conn.closeCode = code;
      }
    });
    await wss.listen({
      port,
      hostname: '127.0.0.1',
      httpHandler: () => {
        const refuse = server?.refuseWith;
        return new Response('refused', { status: refuse?.status ?? 400 });
      },
    });
    return server;
  }

  /** Resolve with the `n`th (1-based) connection once it has opened. */
  async connection(n = 1, timeoutMs = 3_000): Promise<MockConnection> {
    const deadline = Date.now() + timeoutMs;
    while (this.connections.length < n) {
      if (Date.now() > deadline) {
        throw new Error(`connection #${n} never opened`);
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    return this.connections[n - 1]!;
  }

  async stop(): Promise<void> {
    await this.#wss.close();
  }
}

/** Pull events from an async iterator until `match` returns true; returns all pulled. */
export async function collectUntil<T>(
  iterator: AsyncIterator<T>,
  match: (event: T) => boolean,
  timeoutMs = 3_000,
): Promise<T[]> {
  const out: T[] = [];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `timed out; collected ${JSON.stringify(out.map((e) => (e as { type?: string }).type))}`,
      );
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = await Promise.race([
      iterator.next(),
      new Promise<'timeout'>((r) => {
        timer = setTimeout(() => r('timeout'), remaining);
      }),
    ]);
    clearTimeout(timer);
    if (next === 'timeout') continue;
    if (next.done) return out;
    out.push(next.value);
    if (match(next.value)) return out;
  }
}
