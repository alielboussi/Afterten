import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "app/dashboard");

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".tsx")) patch(p);
  }
}

function patch(file) {
  let c = fs.readFileSync(file, "utf8");
  if (!c.includes("dashboard-page.module")) return;
  c = c.replace(/import page from [^\n]+\n/g, "");
  c = c.replaceAll("page.pageShellWide", '"at-page-shell-wide"');
  c = c.replaceAll("page.pageShell", '"at-page-shell"');
  c = c.replaceAll("page.pageTitle", '"at-page-title"');
  c = c.replaceAll("page.lead", '"at-page-lead"');
  c = c.replaceAll("page.card", '"at-page-card"');
  c = c.replaceAll("page.sectionTitle", '"at-page-sectionTitle"');
  c = c.replaceAll("page.msgErr", '"at-page-msgErr"');
  c = c.replaceAll('className={"at-page', 'className="at-page');
  fs.writeFileSync(file, c);
  console.log("updated", file);
}

walk(root);
