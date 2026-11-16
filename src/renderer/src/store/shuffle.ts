/**
 * Pick the next index in shuffle mode: a random track that hasn't played yet this round.
 * Returns -1 when every track has played (the caller decides whether to start a new round).
 */
export function pickShuffle(
  length: number,
  current: number,
  played: (i: number) => boolean,
  random: () => number = Math.random
): number {
  const candidates: number[] = []
  for (let i = 0; i < length; i++) if (i !== current && !played(i)) candidates.push(i)
  if (!candidates.length) return -1
  return candidates[Math.floor(random() * candidates.length)]
}
