const ALIASES = new Map([
  ['@asserts', '@std/assert'],
  ['@test', '@tundralibs/compat/test'],
  ['@wss', '@tundralibs/compat/websocket'],
  ['@restler', '@tundralibs/restler'],
  ['@guardian', '@tundralibs/guardian'],
  ['@utils', '@tundralibs/utils'],
  ['@crypt', '@tundralibs/crypt'],
  ['@id', '@tundralibs/id'],
  ['@encoding', '@std/encoding'],
]);

export function resolve(specifier, context, nextResolve) {
  return nextResolve(ALIASES.get(specifier) ?? specifier, context);
}