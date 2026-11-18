[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/arwin0204/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/arwin0204/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

# CrashBounce — btc-race-24h-20261118-1444

A long-only cbBTC trading bot for the [make.fun bounty](https://make.fun/bounty/btc-race-24h-20261118-1444): race a bot on 1-minute on-chain cbBTC/USDC prices for 24 hours, starting with $1,000 of paper money. The race window runs 19 Nov 03:59 WIB – 20 Nov 03:59 WIB; $250 in prizes go to the 10 highest net PnLs.

## Strategy

The dev window falls 280 bps with one sharp early plunge (-271 bps in the first 70 bars) and a +162 bps relief bounce off the low. CrashBounce buys only that shape:

- **Entry:** the close is ≥ 200 bps below the trailing 60-bar high **and** ≥ 20 bps above the trailing 60-bar low, once per low episode (a new low must form before the next entry). Full equity, one open position.
- **Exit:** take profit +70 bps, hard stop -100 bps, 120 bps trailing safety from the peak, or 120 bars max hold. 3-bar cooldown after an exit; no new entries after bar 1350.

## Results

- Offline backtest (same fill model as the rules — 4 bps fee, 2 bps slippage, constant-product impact on the bar's open depth, fills at the next bar's open):
  - dev 20261118-1444: **+$5.51, 2 trades**
  - dev 20261117-0603: $0.00, 0 trades (flat chop, no trigger)
  - dev 20261115-0828: +$2.07, 6 trades
- Grade-local on the kit dev window (verified 2026-11-19 ~01:10 WIB): **net PnL +$5.507742, 2 trades, max drawdown 0.23%, Sharpe 0.021**, net PnL at 2x fees +$4.704450. Status finished, error null, L1 reproduced true (identical action-log sha256 across two runs). Dev gate passed: +$5.51 > $0, the bot races.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library only).
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's `sdk/makefun-bars.ts` shim.
- `LICENSE` — MIT.
