// backtest_v4.js

const fs = require('fs');
const ccxt = require('ccxt');

(async () => {
  console.log('🟣 Iniciando o backtest V4...');

  const exchange = new ccxt.binance();
  const symbol = 'BTC/USDT';
  const timeframe = '1h';
  const since = exchange.parse8601('2025-01-01T00:00:00Z');
  const limit = 2000;
  const candles = await exchange.fetchOHLCV(symbol, timeframe, since, limit);

  console.log(`⏳ ${candles.length} candles recebidos.`);

  const oneDayHours = 24;
  const days = [];

  for (let i = 0; i < candles.length; i += oneDayHours) {
    const dayCandles = candles.slice(i, i + oneDayHours);
    if (dayCandles.length === oneDayHours) {
      days.push(dayCandles);
    }
  }

  let balance = 10000;
  const binanceFeeRate = 0.001; // 0.1% de taxa
  let results = [];

  for (const day of days) {
    const firstCandle = day[1];
    const high = firstCandle[2];
    const low = firstCandle[3];

    const range = high - low;
    const fib_0618 = high - range * 0.618;
    const fib_100 = high - range * 1;
    const fib_1618 = high + range * 0.618;
    const fib_2618 = high + range * 1.618;
    const fib_m0618 = low - range * 0.618;

    let position = null;
    let entryPrice = 0;
    let stopLoss = 0;
    let takeProfit = 0;
    let halfSold = false;
    let movedToBreakEven = false;
    let positionSize = 1; // 1 unidade por padrão

    for (const candle of day.slice(2)) {
      const [timestamp, open, highCandle, lowCandle, close] = candle;

      if (!position) {
        if (lowCandle <= fib_0618) {
          position = 'long';
          entryPrice = fib_0618;
          stopLoss = fib_m0618;
          takeProfit = fib_2618;
          halfSold = false;
          movedToBreakEven = false;
          positionSize = 1;
          // Desconta taxa de compra
          balance -= entryPrice * positionSize * binanceFeeRate;
        }
      } else {
        if (!movedToBreakEven && highCandle >= fib_100) {
          stopLoss = entryPrice;
          movedToBreakEven = true;
        }

        if (!halfSold && highCandle >= fib_1618) {
          // Vendeu metade no 1.618
          const profitHalf = (fib_1618 - entryPrice) * (positionSize / 2);
          balance += profitHalf;
          balance -= fib_1618 * (positionSize / 2) * binanceFeeRate; // taxa de venda
          halfSold = true;
          positionSize = positionSize / 2;
        }

        if (lowCandle <= stopLoss) {
          const exitPrice = stopLoss;
          const pnl = (exitPrice - entryPrice) * positionSize;
          balance += pnl;
          balance -= exitPrice * positionSize * binanceFeeRate; // taxa de venda
          results.push({ day: new Date(timestamp).toISOString().split('T')[0], result: pnl, type: movedToBreakEven ? 'break_even' : 'closed_sl' });
          position = null;
          break;
        } else if (highCandle >= takeProfit) {
          const pnl = (takeProfit - entryPrice) * positionSize;
          balance += pnl;
          balance -= takeProfit * positionSize * binanceFeeRate; // taxa de venda
          results.push({ day: new Date(timestamp).toISOString().split('T')[0], result: pnl, type: 'closed_tp' });
          position = null;
          break;
        }
      }
    }

    if (position) {
      const lastClose = day[day.length - 1][4];
      const pnl = (lastClose - entryPrice) * positionSize;
      balance += pnl;
      balance -= lastClose * positionSize * binanceFeeRate; // taxa de venda
      results.push({ day: new Date(day[day.length - 1][0]).toISOString().split('T')[0], result: pnl, type: 'closed_by_time' });
      position = null;
    }
  }

  // Estatísticas finais
  const totalTrades = results.length;
  const wins = results.filter(r => r.type === 'closed_tp').length;
  const losses = results.filter(r => r.type === 'closed_sl').length;
  const timeClosed = results.filter(r => r.type === 'closed_by_time').length;
  const breakEvens = results.filter(r => r.type === 'break_even').length;
  const finalResult = balance - 10000;

  console.log('\u{1F4DD} Estatísticas finais:');
  console.log(`- Total de Trades: ${totalTrades}`);
  console.log(`- Vitórias (Take Profit): ${wins}`);
  console.log(`- Derrotas (Stop Loss): ${losses}`);
  console.log(`- Break Evens: ${breakEvens}`);
  console.log(`- Fechamentos por Tempo: ${timeClosed}`);
  console.log(`- Lucro/Prejuízo Final: $${finalResult.toFixed(2)}`);
  console.log(`- Saldo Final: $${balance.toFixed(2)}`);

  fs.writeFileSync('backtest_result_v4.json', JSON.stringify(results, null, 2));
})();
