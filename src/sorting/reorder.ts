/**
 * Reorders the ranked entries of `items` while leaving every unranked entry at
 * its original index.
 *
 * In the file explorer this means folders stay exactly where Obsidian put them
 * and only file rows move. The sort is stable, so entries sharing a rank keep
 * the order they arrived in — which is how the user's own sort setting
 * survives as the secondary key.
 *
 * @param rankOf Rank for an entry, or null to pin it in place.
 */
export function reorderByRank<T>(
	items: T[],
	rankOf: (item: T) => number | null,
): T[] {
	const slots: number[] = [];
	const ranked: { item: T; rank: number }[] = [];

	items.forEach((item, index) => {
		const rank = rankOf(item);
		if (rank === null) return;

		slots.push(index);
		ranked.push({ item, rank });
	});

	if (ranked.length < 2) return items;

	// Array.prototype.sort is stable as of ES2019, so equal ranks retain their
	// incoming relative order.
	ranked.sort((a, b) => a.rank - b.rank);

	const result = items.slice();
	slots.forEach((slot, index) => {
		const entry = ranked[index];
		if (entry) result[slot] = entry.item;
	});

	return result;
}
