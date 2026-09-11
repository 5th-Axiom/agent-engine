/** Close every resource in order even when an earlier close fails. */
export async function closeResources(
  ...resources: ({ close(): Promise<unknown> } | undefined)[]
): Promise<void> {
  const errors: unknown[] = [];
  for (const resource of resources) {
    try {
      await resource?.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Resource cleanup failed");
}
