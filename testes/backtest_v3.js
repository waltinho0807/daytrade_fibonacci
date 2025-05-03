const fs = require('fs');
const ccxt = require('ccxt');

const TAXA_BINANCE = 0.002; // 0.1% na compra + 0.1% na venda = 0.2%

async function runBacktest() {
  console.log('🔵 Iniciando o backtest V3 (TP no nível 1.0)...');

  const exchange = new ccxt.binance({
    enableRateLimit: true,
  });

  console.log('⏳ Buscando candles...');
  const candles = await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 1000);

  console.log(`✅ ${candles.length} candles recebidos.`);

  const dailyCandles = groupByDay(candles);

  let balance = 10000; // saldo inicial
  const results = [];
  let totalTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalClosedByTime = 0;

  for (const day of dailyCandles) {
    const firstCandle = day[1]; // 01:00h
    if (!firstCandle) continue;

    const high = firstCandle[2];
    const low = firstCandle[3];

    const fib0_618 = low + (high - low) * 0.618;
    const fib1_0 = high;
    const fib_minus_0_618 = low - (high - low) * 0.618;

    let bought = false;
    let entryPrice = 0;
    let dayResult = null;

    for (let candle of day) {
      const [timestamp, open, highPrice, lowPrice, close] = candle;

      if (!bought && lowPrice <= fib0_618) {
        bought = true;
        entryPrice = fib0_618 * (1 + TAXA_BINANCE); // simula compra com taxa
      }

      if (bought) {
        // Take Profit
        if (highPrice >= fib1_0) {
          const sellPrice = fib1_0 * (1 - TAXA_BINANCE);
          const profit = sellPrice - entryPrice;
          balance += profit;
          totalTrades++;
          totalWins++;
          dayResult = 'closed_tp';
          break;
        }

        // Stop Loss
        if (lowPrice <= fib_minus_0_618) {
          const sellPrice = fib_minus_0_618 * (1 - TAXA_BINANCE);
          const loss = sellPrice - entryPrice;
          balance += loss;
          totalTrades++;
          totalLosses++;
          dayResult = 'closed_sl';
          break;
        }
      }
    }

    if (bought && !dayResult) {
      // Fecha no preço de fechamento do último candle do dia
      const closePrice = day[day.length - 1][4];
      const sellPrice = closePrice * (1 - TAXA_BINANCE);
      const result = sellPrice - entryPrice;
      balance += result;
      totalTrades++;
      totalClosedByTime++;
      dayResult = 'closed_by_time';
    }

    results.push({
      date: new Date(day[0][0]).toISOString().slice(0, 10),
      result: dayResult || 'no_trade',
      balance: balance.toFixed(2),
    });

    if (dayResult) {
      console.log(`📈 Dia ${new Date(day[0][0]).toISOString().slice(0, 10)} finalizado: ${dayResult}`);
    }
  }

  const stats = {
    totalTrades,
    totalWins,
    totalLosses,
    totalClosedByTime,
    finalBalance: balance.toFixed(2),
    lucroPrejuizo: (balance - 10000).toFixed(2),
  };

  console.log('📝 Resultado salvo em backtest_result_v3.json');
  fs.writeFileSync('backtest_result_v3.json', JSON.stringify({ results, stats }, null, 2));

  console.log('📊 Estatísticas finais:');
  console.log(`- Total de Trades: ${stats.totalTrades}`);
  console.log(`- Vitórias (Take Profit): ${stats.totalWins}`);
  console.log(`- Derrotas (Stop Loss): ${stats.totalLosses}`);
  console.log(`- Fechamentos por Tempo: ${stats.totalClosedByTime}`);
  console.log(`- Lucro/Prejuízo Final: $${stats.lucroPrejuizo}`);
  console.log(`- Saldo Final: $${stats.finalBalance}`);
}

function groupByDay(candles) {
  const days = [];
  let currentDay = [];
  let currentDate = new Date(candles[0][0]).getUTCDate();

  for (const candle of candles) {
    const candleDate = new Date(candle[0]).getUTCDate();
    if (candleDate !== currentDate) {
      days.push(currentDay);
      currentDay = [];
      currentDate = candleDate;
    }
    currentDay.push(candle);
  }
  if (currentDay.length > 0) {
    days.push(currentDay);
  }
  return days;
}

runBacktest();
