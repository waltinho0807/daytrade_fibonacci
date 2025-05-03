import ccxt from 'ccxt';
import fs from 'fs';
import { calculateFibonacci } from '../utils/fibonacci.js'; // use sua função real aqui

(async () => {
  const exchange = new ccxt.binance();
  const symbol = 'BTC/USDT';
  const timeframe = '1h';
  const since = exchange.parse8601('2025-01-01T00:00:00Z');
  const limit = 2000;

  const candles = await exchange.fetchOHLCV(symbol, timeframe, since, limit);
  const groupedByDay = {};

  for (const c of candles) {
    const date = new Date(c[0]).toISOString().split('T')[0];
    if (!groupedByDay[date]) groupedByDay[date] = [];
    groupedByDay[date].push({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    });
  }

  const initialBalance = 10000;
  let balance = initialBalance;
  const results = [];

  for (const [day, candles] of Object.entries(groupedByDay)) {
    const candle0100 = candles.find(c => new Date(c.time).getUTCHours() === 1);
    if (!candle0100) continue;

    const fib = calculateFibonacci(candle0100.high, candle0100.low);
    let position = null;
    let breakEvenMoved = false;

    for (const candle of candles) {
      const time = new Date(candle.time);
      const hour = time.getUTCHours();

      const price = candle.low <= fib.entry ? fib.entry : null;

      if (!position && price) {
        position = {
          entryPrice: fib.entry,
          sl: fib.fib1618,
          tp: fib.tp,
          size: 10000 / fib.entry,
          entryTime: time
        };
        continue;
      }

      if (position) {
        const currentPrice = candle.close;

        if (!breakEvenMoved && currentPrice >= fib.fib100) {
          position.sl = fib.fib0718;
          breakEvenMoved = true;
        }

        if (candle.low <= position.sl) {
          const pnl = (position.sl - position.entryPrice) * position.size;
          balance += pnl;
          results.push({
            day,
            type: breakEvenMoved ? 'locked_profit_stop' : 'closed_sl',
            result: pnl
          });
          position = null;
          break;
        }

        if (candle.high >= position.tp) {
          const pnl = (position.tp - position.entryPrice) * position.size;
          balance += pnl;
          results.push({
            day,
            type: 'closed_tp',
            result: pnl
          });
          position = null;
          break;
        }

        if (hour === 23 && new Date(candle.time).getUTCMinutes() === 59) {
          const pnl = (currentPrice - position.entryPrice) * position.size;
          balance += pnl;
          results.push({
            day,
            type: 'closed_by_time',
            result: pnl
          });
          position = null;
          break;
        }
      }
    }
  }

  const totalTrades = results.length;
  const wins = results.filter(r => r.type === 'closed_tp').length;
  const losses = results.filter(r => r.type === 'closed_sl').length;
  const locked = results.filter(r => r.type === 'locked_profit_stop').length;
  const timed = results.filter(r => r.type === 'closed_by_time').length;
  const finalResult = balance - initialBalance;

  console.log(`\n📊 Estatísticas do Backtest:`);
  console.log(`- Total de Trades: ${totalTrades}`);
  console.log(`- Vitórias: ${wins}`);
  console.log(`- Derrotas: ${losses}`);
  console.log(`- Stops com Lucro Travado: ${locked}`);
  console.log(`- Fechamentos por Tempo: ${timed}`);
  console.log(`- Lucro/Prejuízo Final: $${finalResult.toFixed(2)}`);
  console.log(`- Saldo Final: $${balance.toFixed(2)}`);

  fs.writeFileSync('backtest_result_realbot.json', JSON.stringify(results, null, 2));
})();
