/** Minimal GraphQL execution context for guard tests (no Nest testing module needed). */
export function graphqlContext(ctx: Record<string, unknown>): any {
  const args = [{}, {}, ctx, {}];
  return {
    getArgs: () => args,
    getArgByIndex: (index: number) => args[index],
    getClass: () => class Target {},
    getHandler: () => function handler() {},
    getType: () => 'graphql',
  };
}
