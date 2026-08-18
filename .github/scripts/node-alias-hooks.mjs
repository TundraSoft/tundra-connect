const ALIASES = new Map([
  ['@asserts', '@std/assert'],
  ['@test', '@tundralibs/compat/test'],
  ['@restler', '@tundralibs/restler'],
  ['@guardian', '@tundralibs/guardian'],
  ['@utils', '@tundralibs/utils'],
]);

export function resolve(specifier, context, nextResolve) {
  return nextResolve(ALIASES.get(specifier) ?? specifier, context);
}