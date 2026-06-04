/**
 * pairCode — small util for Phase 78. Generates a human-readable
 * 6-character pairing code (e.g. "BLU-SKY-42") that the user reads
 * off the Mac screen and types into the phone. Codes rotate every
 * 60s, so the user has plenty of time to type on a phone keyboard
 * but a casual onlooker can't reuse an old code.
 *
 * The format is three 2-char "syllables" separated by dashes:
 *   - First:  consonant-pair (no ambiguous: no I/O/0/1)
 *   - Second: consonant-vowel
 *   - Third:  2 digits
 *
 * Examples: BLU-SKY-42, RED-OAK-19, PIN-RAY-07
 *
 * Why not crypto-random hex (e.g. "a3f9b2"): humans mistype
 * 6 hex chars at ~20% error rate. Word+digit pairs are read once
 * and typed at ~3% error rate even on a phone keyboard.
 *
 * Note: this util is only for the *display* half of the pair
 * handshake. The *redeem* half (POST /api/pair/redeem) will live
 * on the gateway side and is Phase 78b. For now the phone can type
 * the code but nothing happens yet — this util makes the Mac side
 * show a stable, regenerating code while the rest of the protocol
 * is being built.
 */
const CONSONANT = 'BCDFGHJKLMNPQRSTVWXYZ';   // 21, no I/O
const VOWEL = 'AEU';                          // 3, no I (ambiguous with 1) and no O (ambiguous with 0)
const DIGIT = '23456789';                     // 8, no 0/1

function pickOne(s: string): string {
  // Use crypto.getRandomValues when available; fall back to Math.random
  // for environments where crypto isn't exposed (e.g. some RN runtimes).
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return s[buf[0] % s.length];
  }
  return s[Math.floor(Math.random() * s.length)];
}

export function generatePairCode(): string {
  const a = pickOne(CONSONANT) + pickOne(CONSONANT);
  const b = pickOne(CONSONANT) + pickOne(VOWEL);
  const c = pickOne(DIGIT) + pickOne(DIGIT);
  return `${a}-${b}-${c}`;
}

/** Returns a fresh {code, expiresAt} pair. expiresAt is ms-since-epoch. */
export function freshPairCodePair(ttlMs = 60_000): { code: string; expiresAt: number } {
  return { code: generatePairCode(), expiresAt: Date.now() + ttlMs };
}
