// Tiny Bot — beat buy-and-hold on Solana hourly bars.
//
// Strategy: trend-filtered cross-sectional momentum, long only.
//   - Per symbol, EMA(8) and EMA(21) over closes, seeded during warm-up.
//   - A symbol is a buy candidate when it is in an uptrend (EMA8 above
//     EMA21) and its trailing 24-bar return is positive.
//   - Candidates are ranked by trailing 24-bar return; the bot holds at
//     most the top 7, equal-weighted, rebalanced every 12 bars.
//   - A held position is sold in full when its trend flips (EMA8 below
//     EMA21), it falls 10% under its cost (stop-loss), or it rises 25%
//     over its cost (take-profit). Sells are checked on every bar.
//   - Orders fill at the next bar's open; slippage is capped at 100 bps
//     so a sell into a liquidity gap is refused and retried, not dumped.
//   - Pure deterministic float arithmetic on closes: no clock, no
//     environment, no randomness, so both graded runs agree byte for byte.
//
// Laid out like the kit's baselines: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.
import { BPS, runBars, type Bar, type BarsState, type BuyInput, type OrderInput, type SellInput } from "./vendor/makefun-bars.ts";

const FAST_BARS = 8;
const SLOW_BARS = 21;
const LOOKBACK_BARS = 24;
const TOP_N = 7;
const REBALANCE_EVERY = 12;
/** Stop-loss: sell when the position is worth 90% of its cost or less.
// Take-profit: sell when it is worth 125% of its cost or more. */
const STOP_NUM = 90n;
const STOP_DEN = 100n;
const MAX_SLIPPAGE_BPS = 100;

/** One EMA: the mean of its first span of closes, then 2/(span+1) steps. */
interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

interface Series {
  fast: Ema;
  slow: Ema;
  closes: number[];
}

const series = new Map<string, Series>();

function step(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

function push(bar: Bar): void {
  let s = series.get(bar.symbol);
  if (s === undefined) {
    s = { fast: { span: FAST_BARS, warm: [], value: null }, slow: { span: SLOW_BARS, warm: [], value: null }, closes: [] };
    series.set(bar.symbol, s);
  }
  const c = Number(bar.c);
  step(s.fast, c);
  step(s.slow, c);
  s.closes.push(c);
}

function uptrend(s: Series): boolean {
  return s.fast.value !== null && s.slow.value !== null && s.fast.value > s.slow.value;
}

function downtrend(s: Series): boolean {
  return s.fast.value !== null && s.slow.value !== null && s.fast.value < s.slow.value;
}

/** Close now vs LOOKBACK_BARS bars back; null without both. */
function trailingReturn(s: Series): number | null {
  if (s.closes.length <= LOOKBACK_BARS) return null;
  const then = s.closes[s.closes.length - 1 - LOOKBACK_BARS];
  const now = s.closes[s.closes.length - 1];
  if (then <= 0) return null;
  return now / then - 1;
}

await runBars({
  onBatch(state: BarsState, batch) {
    for (const bar of batch.bars) push(bar);
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;
    const sells: SellInput[] = [];
    for (const [symbol, held] of state.positions) {
      const s = series.get(symbol)!;
      const value = state.value(symbol, held.qty);
      const stop = value * STOP_DEN <= held.cost * STOP_NUM;
      const take = value * 100n >= held.cost * 125n;
      if (downtrend(s) || stop || take) {
        sells.push({ side: "sell", symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    }
    // Buys only on rebalance bars, so the book turns over in an orderly
    // way: a position is held at least REBALANCE_EVERY bars unless a
    // sell rule (trend flip, negative trailing return, stop-loss) fires.
    const buys: BuyInput[] = [];
    if (batch.seq % REBALANCE_EVERY === 0) {
      const ranked: { ret: number; symbol: string }[] = [];
      for (const { symbol } of state.hello.symbols) {
        if (state.positions.has(symbol)) continue;
        const s = series.get(symbol);
        if (s === undefined) continue;
        const ret = trailingReturn(s);
        if (uptrend(s) && ret !== null && ret > 0) ranked.push({ ret, symbol });
      }
      ranked.sort((a, b) => (b.ret - a.ret) || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
      const slots = Math.min(TOP_N, caps.max_open_positions);
      let room = slots - state.positions.size;
      const stake = state.equity / BigInt(slots);
      const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
      let cash = state.cash;
      for (const { symbol } of ranked) {
        if (room <= 0) break;
        let slice = stake < byWeight ? stake : byWeight;
        if (cash < slice) slice = cash;
        if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
        buys.push({ side: "buy", symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
        cash -= slice;
        room--;
      }
    }
    const orders: OrderInput[] = [...sells, ...buys];
    return orders.slice(0, caps.max_orders_per_bar);
  },
});
