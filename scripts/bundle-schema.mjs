import { readFile, writeFile, readdir } from "node:fs/promises";
const directory = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(directory))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const parts = await Promise.all(
  files.map(
    async (name) =>
      `-- ${name}\n${await readFile(new URL(name, directory), "utf8")}`,
  ),
);
await writeFile(
  new URL("../supabase/schema.sql", import.meta.url),
  "-- Fresh Supabase projects only. For existing projects apply only unapplied migrations.\n" +
    parts.join("\n"),
);
console.log(`Bundled ${files.length} migrations into supabase/schema.sql`);
