/**
 * Keeps the vendored WebSocket core identical in every connect that ships a
 * `./sockets` export. Each connect is published on its own, so the core
 * (`socket/FeedSocket.ts`, its test, and the mock server fixture) is copied
 * rather than shared; this check fails CI when the copies drift.
 *
 * The canonical copy is `connectors/polymarket/socket/`. `--fix` copies it
 * over the others.
 *
 * Usage: deno run --allow-read [--allow-write] .github/scripts/socket-core.ts [--fix]
 */
const CANONICAL = 'connectors/polymarket/socket';
const FILES = [
  'FeedSocket.ts',
  'FeedSocket.test.ts',
  'fixtures/MockFeedServer.ts',
];
const fix = Deno.args.includes('--fix');

const copies: string[] = [];
for await (const entry of Deno.readDir('connectors')) {
  const dir = `connectors/${entry.name}/socket`;
  if (dir === CANONICAL) continue;
  try {
    await Deno.stat(`${dir}/FeedSocket.ts`);
    copies.push(dir);
  } catch {
    // This connect has no sockets.
  }
}

let drift = 0;
for (const file of FILES) {
  const canonical = await Deno.readTextFile(`${CANONICAL}/${file}`);
  for (const dir of copies) {
    const path = `${dir}/${file}`;
    let current: string | undefined;
    try {
      current = await Deno.readTextFile(path);
    } catch {
      current = undefined;
    }
    if (current === canonical) continue;
    if (fix) {
      await Deno.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
      await Deno.writeTextFile(path, canonical);
      console.log(`synced ${path}`);
    } else {
      console.error(`${path} differs from ${CANONICAL}/${file}`);
      drift++;
    }
  }
}
if (drift > 0) {
  console.error(
    `\n${drift} vendored socket file(s) drifted. Edit the canonical copy in ${CANONICAL}/ and run \`deno task check:socket-core --fix\`.`,
  );
  Deno.exit(1);
}
console.log(`socket core identical across ${copies.length + 1} connects`);
