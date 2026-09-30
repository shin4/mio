/** Resolve the product home without using the upstream CLI's default ~/.dsh. */
export function resolveMioHome(
  product: { name: string; dataDirectory: string },
  env?: NodeJS.ProcessEnv,
  userData?: string,
): string
