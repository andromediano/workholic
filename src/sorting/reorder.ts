/**
 * Sorts the keyed entries of `items` among themselves while leaving every
 * unkeyed entry at its original index.
 *
 * In the file explorer this means folders stay exactly where Obsidian put them
 * and only file rows move. The sort is stable, so entries that compare equal
 * keep the order they arrived in — which is how an earlier sort survives as
 * the secondary key.
 *
 * @param keyOf Sort key for an entry, or null to pin it in place.
 */
export function reorderPinned<T, K>(
	items: T[],
	keyOf: (item: T) => K | null,
	compare: (a: K, b: K) => number,
): T[] {
	const slots: number[] = [];
	const keyed: { item: T; key: K }[] = [];

	items.forEach((item, index) => {
		const key = keyOf(item);
		if (key === null) return;

		slots.push(index);
		keyed.push({ item, key });
	});

	if (keyed.length < 2) return items;

	// Array.prototype.sort is stable as of ES2019, so equal keys retain their
	// incoming relative order.
	keyed.sort((a, b) => compare(a.key, b.key));

	const result = items.slice();
	slots.forEach((slot, index) => {
		const entry = keyed[index];
		if (entry) result[slot] = entry.item;
	});

	return result;
}

/**
 * Reorders the ranked entries of `items` by ascending rank while leaving every
 * unranked entry at its original index.
 *
 * @param rankOf Rank for an entry, or null to pin it in place.
 */
export function reorderByRank<T>(
	items: T[],
	rankOf: (item: T) => number | null,
): T[] {
	return reorderPinned(items, rankOf, (a, b) => a - b);
}
