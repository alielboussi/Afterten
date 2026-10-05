import { NextResponse } from "next/server";

/**
 * Mobile OAuth return URL for the Supervisor Expo app.
 * Supabase redirects here after Google sign-in. Expo WebBrowser on Android often
 * cannot read URL hash fragments — rewrite hash to query so openAuthSessionAsync
 * receives tokens/code and closes back to the app (works in Expo Go and dev builds).
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
  <p><strong>Finishing sign-in…</strong></p>
  <p id="fallback" hidden>Tap the <strong>close (×)</strong> button above to return to the Supervisor app.</p>
  <script>
    (function () {
      var hash = location.hash;
      if (hash && hash.length > 1) {
        var merged =
          location.pathname +
          (location.search ? location.search + "&" + hash.slice(1) : "?" + hash.slice(1));
        location.replace(merged);
        return;
      }
      setTimeout(function () {
        var el = document.getElementById("fallback");
        if (el) el.hidden = false;
      }, 2500);
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
