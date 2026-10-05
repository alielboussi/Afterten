import { NextResponse } from "next/server";

/**
 * Mobile OAuth return URL for the Supervisor Expo app.
 * Supabase redirects here after Google sign-in; this page forwards tokens/code
 * to afterten-supervisor:// so the in-app browser can close and the app gets a session.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Afterten Supervisor</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem 1.25rem; color: #292524; }
    p { line-height: 1.5; max-width: 22rem; margin: 0.75rem auto; }
  </style>
</head>
<body>
  <p><strong>Returning to Afterten Supervisor…</strong></p>
  <p id="fallback" hidden>If the app does not open, close this window and tap Continue with Google again in the Supervisor app.</p>
  <script>
    (function () {
      var appUrl = "afterten-supervisor://auth/callback" + (location.search || "") + (location.hash || "");
      location.replace(appUrl);
      setTimeout(function () {
        var el = document.getElementById("fallback");
        if (el) el.hidden = false;
      }, 3000);
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
