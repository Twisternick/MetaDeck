// The hidden skill rating behind ranked matchmaking: Glicko-2 (Mark Glickman), updated after every
// ranked game (each game is its own rating period). A rating is { rating, rd, vol }: rating starts at
// 1500, and rd (how unsure the rating is) starts high, so a new player's first games move it a lot and
// it settles as they play. Players never see it; they see their rank (src/data/ranked.js).

const SCALE = 173.7178;
const TAU = 0.5;          // how much volatility can change
const EPSILON = 0.000001;
export const START = { rating: 1500, rd: 350, vol: 0.06 };
const MIN_RD = 30;        // a rating never becomes completely certain
const MAX_RD = 350;

const g = phi => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu, muJ, phiJ) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

// The new rating of `a` after one game against `b`; score is 1 (a won), 0 (a lost) or 0.5 (draw).
export function rate(a, b, score) {
  const mu = (a.rating - 1500) / SCALE, phi = a.rd / SCALE;
  const muJ = (b.rating - 1500) / SCALE, phiJ = b.rd / SCALE;
  const gJ = g(phiJ);
  const E = expected(mu, muJ, phiJ);
  const v = 1 / (gJ * gJ * E * (1 - E));
  const delta = v * gJ * (score - E);

  // The new volatility (Illinois-method iteration from the Glicko-2 paper).
  const A0 = Math.log(a.vol * a.vol);
  const f = x => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - A0) / (TAU * TAU);
  };
  let A = A0;
  let B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(A0 - k * TAU) < 0) k++; B = A0 - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; Math.abs(B - A) > EPSILON && i < 100; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * gJ * (score - E);
  return {
    rating: Math.round((muNew * SCALE + 1500) * 10) / 10,
    rd: Math.min(MAX_RD, Math.max(MIN_RD, phiNew * SCALE)),
    vol,
  };
}
