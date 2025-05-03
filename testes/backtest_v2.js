// backtest_v2.js

const fs = require('fs');
const ccxt = require('ccxt');

(async () => {
  console.log('🔵 Iniciando o backtest com trailing stop...');

  // Configurações do backtest
  const exchange = new ccxt.binance();
  const symbol = 'BTC/USDT';
  const timeframe = '1h';
  const since = exchange.parse8601('2025-01-01T00:00:00Z');
  const limit = 2000; // Pegar mais candles para garantir os 90 dias
  const candles = await exchange.fetchOHLCV(symbol, timeframe, since, limit);

  console.log(`⏳ ${candles.length} candles recebidos.`);

  const oneDayHours = 24;
  const days = [];

  // Organizar candles por dia
  for (let i = 0; i < candles.length; i += oneDayHours) {
    const dayCandles = candles.slice(i, i + oneDayHours);
    if (dayCandles.length === oneDayHours) {
      days.push(dayCandles);
    }
  }

  let balance = 10000; // Começa com 10k
  let results = [];

  for (const day of days) {
    const firstCandle = day[1]; // Candle da 01:00
    const high = firstCandle[2];
    const low = firstCandle[3];

    // Fibonacci levels
    const range = high - low;
    const fib_0618 = high - range * 0.618;
    const fib_100 = high - range * 1;
    const fib_1618 = high + range * 0.618;
    const fib_2618 = high + range * 1.618;
    const fib_m0618 = low - range * 0.618; // -0.618

    let position = null;
    let entryPrice = 0;
    let stopLoss = 0;
    let takeProfit = 0;
    let movedToBreakEven = false;

    for (const candle of day.slice(2)) { // Começa depois da 01:00
      const [timestamp, open, highCandle, lowCandle, close] = candle;

      if (!position) {
        if (lowCandle <= fib_0618) {
          // Compra no 0.618
          position = 'long';
          entryPrice = fib_0618;
          stopLoss = fib_m0618;
          takeProfit = fib_2618;
        }
      } else {
        if (!movedToBreakEven && highCandle >= fib_100) {
          // Se bater 1.0 move stop para preço de entrada
          stopLoss = entryPrice;
          movedToBreakEven = true;
        }

        if (lowCandle <= stopLoss) {
          // Stopado
          const loss = movedToBreakEven ? 0 : (stopLoss - entryPrice);
          balance += loss;
          results.push({ day: new Date(timestamp).toISOString().split('T')[0], result: loss, type: loss === 0 ? 'break_even' : 'closed_sl' });
          position = null;
          break;
        } else if (highCandle >= takeProfit) {
          // Take profit
          const profit = takeProfit - entryPrice;
          balance += profit;
          results.push({ day: new Date(timestamp).toISOString().split('T')[0], result: profit, type: 'closed_tp' });
          position = null;
          break;
        }
      }
    }

    if (position) {
      // Se terminou o dia com operação aberta, fecha a mercado
      const lastClose = day[day.length - 1][4];
      const pnl = lastClose - entryPrice;
      balance += pnl;
      results.push({ day: new Date(day[day.length - 1][0]).toISOString().split('T')[0], result: pnl, type: 'closed_by_time' });
      position = null;
    }
  }

  // Estatísticas
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

  // Salvar resultados
  fs.writeFileSync('backtest_result_v2.json', JSON.stringify(results, null, 2));
})();
