import fs from "fs";
import path from "path";

const root = path.resolve("lib");
const files = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith("Controller.ts")) files.push(p);
  }
}
walk(root);

let patched = 0;
for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const before = src;

  // Always poll Zuvo DB even if Rave Star socket connected
  src = src.replace(
    /this\.roundPollTimer = setInterval\(\(\) => \{\s*if \(this\.destroyed\) return;\s*\/\/ Prefer live socket when connected; otherwise DB is source of truth\s*if \(this\.socketConnected\) return;\s*void this\.pollRoundFromDb\(\);\s*\}, 900\);/g,
    `this.roundPollTimer = setInterval(() => {
      if (this.destroyed) return;
      // Always poll local Zuvo rounds — Rave Star socket may be connected but empty.
      void this.pollRoundFromDb();
    }, 900);`,
  );

  // Also catch shorter variant without comment
  src = src.replace(
    /this\.roundPollTimer = setInterval\(\(\) => \{\s*if \(this\.destroyed\) return;\s*if \(this\.socketConnected\) return;\s*void this\.pollRoundFromDb\(\);\s*\}, 900\);/g,
    `this.roundPollTimer = setInterval(() => {
      if (this.destroyed) return;
      void this.pollRoundFromDb();
    }, 900);`,
  );

  if (src !== before) {
    fs.writeFileSync(file, src);
    patched++;
    console.log("patched", path.relative(process.cwd(), file));
  }
}
console.log("done, patched", patched);
