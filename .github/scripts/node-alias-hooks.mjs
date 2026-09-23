const ALIASES = new Map([
  ['@asserts', '@std/assert'],
  ['@test', '@tundralibs/compat/test'],
  ['@restler', '@tundralibs/restler'],
  ['@guardian', '@tundralibs/guardian'],
  ['@utils', '@tundralibs/utils'],
  ['@crypt', '@tundralibs/crypt'],
  ['@id', '@tundralibs/id'],
]);

export function resolve(specifier, context, nextResolve) {
  return nextResolve(ALIASES.get(specifier) ?? specifier, context);
}