const fs = require('fs');
const ccxt = require('ccxt');

(async () => {
  console.log('🔵 Iniciando o backtest V6 para múltiplos pares...');

  // Configurações
  const exchange = new ccxt.binance();
  const pairs = ['BTC/USDT', 'ETH/USDT', 'LINK/USDT', 'LTC/USDT', 'XRP/USDT', 'XLM/USDT'];
  const timeframe = '1h';
  const since = exchange.parse8601('2025-01-01T00:00:00Z');
  const limit = 2000;

  const allResults = {};

  for (const symbol of pairs) {
    console.log(`\n➡️ Testando par: ${symbol}`);
    const candles = await exchange.fetchOHLCV(symbol, timeframe, since, limit);
    console.log(`⏳ ${candles.length} candles recebidos para ${symbol}`);

    const oneDayHours = 24;
    const days = [];

    for (let i = 0; i < candles.length; i += oneDayHours) {
      const dayCandles = candles.slice(i, i + oneDayHours);
      if (dayCandles.length === oneDayHours) {
        days.push(dayCandles);
      }
    }

    let balance = 10000;
    let results = [];

    for (const day of days) {
      const firstCandle = day[1];
      const high = firstCandle[2];
      const low = firstCandle[3];

      const range = high - low;
      const fib_0618 = high - range * 0.618;
      const fib_100 = high - range * 1;
      const fib_1618 = high + range * 0.718;
      const fib_2618 = high + range * 1.618;
      const fib_m0618 = low - range * 0.618;

      let position = null;
      let entryPrice = 0;
      let stopLoss = 0;
      let takeProfit = 0;
      let movedToBreakEven = false;

      for (const candle of day.slice(2)) {
        const [timestamp, open, highCandle, lowCandle, close] = candle;

        if (!position) {
          if (lowCandle <= fib_0618) {
            position = 'long';
            entryPrice = fib_0618;
            stopLoss = fib_m0618;
            takeProfit = fib_2618;
          }
        } else {
          if (!movedToBreakEven && highCandle >= fib_100) {
            // Move stop para 1.0 (lockando lucro)
            stopLoss = fib_1618;
            movedToBreakEven = true;
          }

          if (lowCandle <= stopLoss) {
            const pnl = stopLoss - entryPrice;
            balance += pnl;
            results.push({
              day: new Date(timestamp).toISOString().split('T')[0],
              result: pnl,
              type: movedToBreakEven ? 'locked_profit_stop' : 'closed_sl'
            });
            position = null;
            break;
          } else if (highCandle >= takeProfit) {
            const profit = takeProfit - entryPrice;
            balance += profit;
            results.push({
              day: new Date(timestamp).toISOString().split('T')[0],
              result: profit,
              type: 'closed_tp'
            });
            position = null;
            break;
          }
        }
      }

      if (position) {
        const lastClose = day[day.length - 1][4];
        const pnl = lastClose - entryPrice;
        balance += pnl;
        results.push({
          day: new Date(day[day.length - 1][0]).toISOString().split('T')[0],
          result: pnl,
          type: 'closed_by_time'
        });
        position = null;
      }
    }

    const totalTrades = results.length;
    const wins = results.filter(r => r.type === 'closed_tp').length;
    const losses = results.filter(r => r.type === 'closed_sl').length;
    const lockedProfitStops = results.filter(r => r.type === 'locked_profit_stop').length;
    const timeClosed = results.filter(r => r.type === 'closed_by_time').length;
    const finalResult = balance - 10000;

    console.log(`\n📊 Estatísticas para ${symbol}:`);
    console.log(`- Total de Trades: ${totalTrades}`);
    console.log(`- Vitórias (Take Profit): ${wins}`);
    console.log(`- Derrotas (Stop Loss): ${losses}`);
    console.log(`- Stops com Lucro Travado: ${lockedProfitStops}`);
    console.log(`- Fechamentos por Tempo: ${timeClosed}`);
    console.log(`- Lucro/Prejuízo Final: $${finalResult.toFixed(2)}`);
    console.log(`- Saldo Final: $${balance.toFixed(2)}`);

    allResults[symbol] = {
      totalTrades,
      wins,
      losses,
      lockedProfitStops,
      timeClosed,
      finalResult: parseFloat(finalResult.toFixed(2)),
      finalBalance: parseFloat(balance.toFixed(2)),
      detailedResults: results
    };
  }

  // Salvar resultados no JSON
  fs.writeFileSync('backtest_result_v6_multi_pairs.json', JSON.stringify(allResults, null, 2));
})();