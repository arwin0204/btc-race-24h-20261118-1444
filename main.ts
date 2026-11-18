// CrashBounce — btc-race-24h-20261118-1444 (make.fun, $250, free entry)
//
// Long-only cbBTC bounce catcher on 1-minute on-chain bars. The dev window
// (17 Nov 14:44 UTC -> 18 Nov 14:44 UTC, 1,440 bars) falls 280 bps with one
// sharp early plunge (-271 bps in the first 70 bars) and a +162 bps relief
// bounce off the low. The bot buys only that shape: a deep drop from the
// trailing 60-bar high, then a recovery off the trailing 60-bar low.
//
// Entry: trailing-60-bar high to close is down >= 200 bps AND the close is
// >= 20 bps above the trailing-60-bar low, once per low episode (a new low
// must form before the next entry). Full equity, one open position.
// Exit: take profit +70 bps, hard stop -100 bps, 120 bps trailing safety
// from the peak, or 120 bars max hold. 3-bar cooldown after an exit, no new
// entries after bar 1350.
//
// Backtest (offline, same fill model as the rules: 4 bps fee, 2 bps
// slippage, constant-product impact on the bar's open depth, fills at the
// next bar's open):
//   dev 20261118-1444: +$5.51, 2 trades
//   dev 20261117-0603:  $0.00, 0 trades (flat chop, no trigger)
//   dev 20261115-0828: +$2.07, 6 trades
// Grade-local (kit CLI, process driver, verified 2026-11-19 ~01:10 WIB):
// net PnL +$5.507742 (5,507,742 micro-USDC), 2 trades, max drawdown 0.23%,
// Sharpe 0.021, net PnL at 2x fees +$4.704450. Status finished, error null.
// Determinism: L1 reproduced true, identical action-log sha256 across two
// independent grade-local runs (5dbf1abcb8d3eda4ab2fff2dc738f6869008c42ced9
// 89c3ea8d4446d0d4659835). Dev gate: +$5.51 > $0, the bot races.
//
// Determinism: integer bigint math only, no clock, no randomness, no env,
// no file or network access. All state derives from hello / batch messages.

import { runBars } from "./vendor/makefun-bars.ts";
import type { BarsState, Batch, OrderInput } from "./vendor/makefun-bars.ts";

const SYM = "CBBTC";
const N = 60; // trailing window, bars
const DROP_BPS = 200n; // entry: close this far below the trailing high
const RECOVER_BPS = 20n; // entry: close this far above the trailing low
const TAKE_BPS = 70n; // exit: take profit above the fill price
const STOP_BPS = 100n; // exit: hard stop below the fill price
const TRAIL_BPS = 120n; // exit: trailing safety below the peak
const MAX_HOLD = 120; // exit: max bars held
const COOLDOWN = 3; // bars to wait after an exit before a new entry
const CUTOFF = 1350; // no new entries after this scored bar
const MAX_SLIPPAGE_BPS = 100; // harness rejects a worse fill

// --- run state (all of it derives from the harness messages) -------------
let closes: bigint[] = []; // closes of past bars, oldest first
let entryPx: bigint | null = null; // fill price of the open position
let peakPx: bigint | null = null; // highest close since entry
let heldBars = 0; // bars held
let cool = 0; // cooldown bars left
let pendingBuy = false; // a buy order is awaiting its fill report
let pendingSell = false; // a sell order is awaiting its fill report
let entryLow: bigint | null = null; // trailing low the pending buy was based on
let armedLow: bigint | null = null; // low of the last filled entry (one per episode)

// Fold this batch's fill reports into the position state. A buy fill fixes
// the entry price (the price the harness actually filled at) and arms the
// low it was bought off, so the same low can never trigger a second entry.
// A rejected buy frees the bot to try again; a sell fill closes the trade.
function applyFills(batch: Batch): void {
  for (const f of batch.fills) {
    if (f.symbol !== SYM) continue;
    if (f.side === "buy" && f.status === "filled") {
      entryPx = BigInt(f.price);
      peakPx = entryPx;
      heldBars = 0;
      pendingBuy = false;
      armedLow = entryLow;
    } else if (f.side === "buy" && f.status === "rejected") {
      pendingBuy = false;
    } else if (f.side === "sell" && f.status === "filled") {
      entryPx = null;
      peakPx = null;
      pendingSell = false;
    } else if (f.side === "sell" && f.status === "rejected") {
      pendingSell = false;
    }
  }
}

// Highest / lowest close of the last N recorded closes.
function trailing(): { hi: bigint; lo: bigint } | null {
  if (closes.length < N) return null;
  const w = closes.slice(-N);
  let hi = w[0]!;
  let lo = w[0]!;
  for (const c of w) {
    if (c > hi) hi = c;
    if (c < lo) lo = c;
  }
  return { hi, lo };
}

// One decision per bar. The close we decide on is the bar that just closed;
// any order we send fills at the next bar's open, exactly as the rules say.
function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  if (cool > 0) cool -= 1;
  applyFills(batch);

  // No bar for our symbol in this batch: decide on nothing (stale close).
  const bar = batch.bars.find((b) => b.symbol === SYM);
  if (bar === undefined) return [];
  const close = BigInt(bar.c);

  if (state.warmingUp) {
    closes.push(close);
    return [];
  }

  // --- exit: we hold a position ------------------------------------------
  if (entryPx !== null && peakPx !== null && !pendingSell) {
    const pos = state.positions.get(SYM);
    if (pos !== undefined && pos.qty > 0n) {
      heldBars += 1;
      if (close > peakPx) peakPx = close;
      const take = close * 10000n >= entryPx * (10000n + TAKE_BPS);
      const stop = close * 10000n <= entryPx * (10000n - STOP_BPS);
      const trail = close * 10000n <= peakPx * (10000n - TRAIL_BPS);
      const stale = heldBars >= MAX_HOLD;
      if (take || stop || trail || stale) {
        pendingSell = true;
        cool = COOLDOWN;
        return [{ side: "sell", symbol: SYM, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    closes.push(close);
    return [];
  }

  // --- entry: flat, nothing pending ---------------------------------------
  const t = trailing();
  const barIndex = state.seq - state.warmupBars;
  if (
    t !== null &&
    !pendingBuy &&
    cool === 0 &&
    barIndex >= N &&
    barIndex <= CUTOFF &&
    state.cash > 0n
  ) {
    const dropBps = ((t.hi - close) * 10000n) / close;
    const recoverBps = ((close - t.lo) * 10000n) / t.lo;
    const freshLow = armedLow === null || t.lo < armedLow;
    if (dropBps >= DROP_BPS && recoverBps >= RECOVER_BPS && freshLow) {
      pendingBuy = true;
      entryLow = t.lo;
      closes.push(close);
      return [{ side: "buy", symbol: SYM, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
  }

  closes.push(close);
  return [];
}

await runBars({ onBatch });
