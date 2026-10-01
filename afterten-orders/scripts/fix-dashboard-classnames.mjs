import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "app/dashboard");

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".tsx")) fix(p);
  }
}

function fix(file) {
  let c = fs.readFileSync(file, "utf8");
  const n = c.replace(/className="(at-page-[^"]+)"\}/g, 'className="$1"');
  if (n !== c) {
    fs.writeFileSync(file, n);
    console.log("fixed", file);
  }
}

walk(root);
