# gorun-tiny-bot-20261126

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/taufan98/gorun-tiny-bot-20261126/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/taufan98/gorun-tiny-bot-20261126/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A tiny paper-trading bot for hourly Solana prices — an entry for
[Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
on make.fun. Entries are ranked by net PnL in USDC on the final 3-day
replay window, and a prize needs a better score than buy-and-hold.

## The strategy

Trend-filtered cross-sectional momentum, long only:

- Per symbol, EMA(8) and EMA(21) over closes, seeded during warm-up.
- A symbol is a buy candidate when it is in an uptrend (EMA8 above EMA21)
  and its trailing 24-bar return is positive.
- Candidates rank by trailing 24-bar return; the bot holds at most the
  top 7, equal-weighted, rebalanced every 12 bars.
- A held position is sold in full when its trend flips (EMA8 below EMA21),
  it falls 10% under its cost (stop-loss), or it rises 25% over its cost
  (take-profit). Sells are checked on every bar.
- Orders fill at the next bar's open; slippage is capped at 100 bps.
- Pure deterministic float arithmetic on closes: no clock, no environment,
  no randomness, so both graded runs agree byte for byte.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` on stdin/stdout via the vendored
shim. Node 22, standard library only, no install and no build step.

## Layout

- `main.ts` — the entry program: the trading bot.
- `vendor/makefun-bars.ts` — the kit's bars-replay shim, vendored byte for byte.
- `LICENSE` — MIT.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tv86zvxh&utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
