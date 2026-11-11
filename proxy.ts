import { NextResponse, type NextRequest } from "next/server";

/**
 * Basic access control for the whole panel (pages and APIs).
 * Active when PANEL_USER and PANEL_PASSWORD are set; the browser shows its login box.
 * Use it behind HTTPS (or inside the internal network): Basic auth sends the
 * credentials on every request.
 */

const REALM = 'Basic realm="Panel de agendamiento", charset="UTF-8"';

/** Compares without exiting early, so the response time does not reveal the password. */
function safeEqual(a: string, b: string) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function decodeBasic(header: string | null): [string, string] | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const i = text.indexOf(":");
    return i < 0 ? null : [text.slice(0, i), text.slice(i + 1)];
  } catch {
    return null;
  }
}

let warned = false;

export function proxy(request: NextRequest) {
  const user = process.env.PANEL_USER;
  const password = process.env.PANEL_PASSWORD;

  if (!user || !password) {
    if (process.env.NODE_ENV === "production" && !warned) {
      warned = true;
      console.warn("[proxy] PANEL_USER/PANEL_PASSWORD no están definidos: el panel queda SIN contraseña.");
    }
    return NextResponse.next();
  }

  const creds = decodeBasic(request.headers.get("authorization"));
  // Both comparisons always run, so a wrong user and a wrong password take the same time.
  const okUser = safeEqual(creds?.[0] ?? "", user);
  const okPassword = safeEqual(creds?.[1] ?? "", password);
  if (creds && okUser && okPassword) return NextResponse.next();

  return new NextResponse("Se requiere usuario y contraseña.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  // Everything except static build files and the health check used by monitoring.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
