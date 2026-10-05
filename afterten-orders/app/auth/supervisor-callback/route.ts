import { NextResponse } from "next/server";

/**
 * Supervisor mobile OAuth bridge (not portal login).
 * Supabase redirects here (HTTPS, always allowlisted). This page forwards auth params
 * to the Expo app deep link in ?app_return= so Android Linking can close the browser.
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
  <p id="err" hidden style="color:#b91c1c"></p>
  <script>
    (function () {
      try {
        var searchParams = new URLSearchParams(location.search);
        var appReturn = searchParams.get("app_return");
        searchParams.delete("app_return");
        if (!appReturn) appReturn = "afterten-supervisor://auth/callback";

        if (location.hash && location.hash.length > 1) {
          new URLSearchParams(location.hash.slice(1)).forEach(function (value, key) {
            searchParams.set(key, value);
          });
        }

        var payload = searchParams.toString();
        var sep = appReturn.indexOf("?") >= 0 ? "&" : "?";
        var target = payload ? appReturn + sep + payload : appReturn;
        location.replace(target);
      } catch (e) {
        var el = document.getElementById("err");
        if (el) {
          el.hidden = false;
          el.textContent = "Could not open the Supervisor app. Close this window and try again in the app.";
        }
      }
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
