export function toggleOrderedSelection(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

// Await each append so server positions follow the user's selection order.
// Stop on failure; callers retain the uncompleted selection for retry.
export async function addEmployeesInOrder(
  ids: string[],
  add: (id: string) => Promise<void>,
  onAdded: (id: string) => void,
): Promise<void> {
  for (const id of ids) {
    await add(id);
    onAdded(id);
  }
}
