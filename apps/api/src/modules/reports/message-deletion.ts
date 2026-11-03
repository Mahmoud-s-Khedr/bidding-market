/** Shared serialization predicate for the messaging module once it is merged. */
export function isDeleted(message: { deletedAt: Date | null }): boolean {
  return message.deletedAt !== null;
}
