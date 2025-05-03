// Importa as bibliotecas necessárias
const ccxt = require('ccxt');
const fs = require('fs');

// Configurações iniciais
const exchange = new ccxt.binance(); // Vamos usar a Binance pública para buscar os candles
const symbol = 'BTC/USDT';            // Par que vamos testar
const timeframe = '1h';               // Gráfico de 1 hora
const daysBack = 90;                  // Número de dias para o backtest
const logs = [];                      // Array para salvar todos os logs/resultados
let balance = 10000;                   // Saldo inicial fictício em USDT
const riskPerTrade = 0.02;             // Arriscamos 2% do saldo por operação

// Função principal
async function runBacktest() {
  console.log('🔵 Iniciando o backtest...');

  // Pega a data de 90 dias atrás
  const since = Date.now() - (daysBack * 24 * 60 * 60 * 1000);

  async function fetchAllCandles(symbol, timeframe, since) {
    let allCandles = [];
    let fetchSince = since;
    let fetchLimit = 1000; // Máximo possível na Binance (depende do par, mas 1000 é seguro)
  
    while (true) {
      const candles = await exchange.fetchOHLCV(symbol, timeframe, fetchSince, fetchLimit);
      if (candles.length === 0) break;
  
      allCandles = allCandles.concat(candles);
  
      // Atualiza o "since" para o próximo lote
      const lastCandle = candles[candles.length - 1];
      fetchSince = lastCandle[0] + 1; // adiciona +1 ms para não pegar o mesmo candle de novo
  
      console.log(`⏳ Candles carregados: ${allCandles.length}`);
  
      // Se o último candle já é muito recente, para
      if (lastCandle[0] >= Date.now() - 60 * 60 * 1000) break;
    }
  
    return allCandles;
  }
  

  // Busca os candles históricos
  console.log('⏳ Buscando candles...');
  const candles = await fetchAllCandles(symbol, timeframe, since);
  console.log(`✅ ${candles.length} candles recebidos.`);

  // Agrupa candles por dia
  const candlesByDay = {};
  candles.forEach(candle => {
    const [timestamp, open, high, low, close, volume] = candle;
    const date = new Date(timestamp).toISOString().slice(0, 10); // yyyy-mm-dd
    if (!candlesByDay[date]) {
      candlesByDay[date] = [];
    }
    candlesByDay[date].push({ timestamp, open, high, low, close });
  });

  // Agora simula o trade para cada dia
  for (const date of Object.keys(candlesByDay)) {
    const dayCandles = candlesByDay[date];

    // Garantimos que o dia tenha candles suficientes (24 candles = 1h x 24h)
    if (dayCandles.length < 24) continue;

    // Pega a vela das 01:00 UTC (índice 1 pois começa em 00:00)
    const candle01 = dayCandles[1];
    const high01 = candle01.high;
    const low01 = candle01.low;

    // Calcula os níveis de Fibonacci
    const diff = high01 - low01;
    const entry = low01 + diff * 0.618;
    const tp = low01 + diff * 1.618;
    const sl = low01 + diff * -0.618;

    // Estado do trade do dia
    let operation = {
      date,
      entry,
      tp,
      sl,
      status: 'waiting',
      entryPrice: null,
      exitPrice: null,
      profit: 0,
    };

    // Simula o dia candle por candle
    for (let i = 2; i < dayCandles.length; i++) {
      const candle = dayCandles[i];

      const priceLow = candle.low;
      const priceHigh = candle.high;

      if (operation.status === 'waiting') {
        // Se preço tocou o entry, compramos
        if (priceLow <= entry) {
          operation.status = 'opened';
          operation.entryPrice = entry;
          const amount = (balance * riskPerTrade) / entry;
          operation.amount = amount;
        }
      } else if (operation.status === 'opened') {
        // Se preço atingiu o take profit
        if (priceHigh >= tp) {
          operation.status = 'closed_tp';
          operation.exitPrice = tp;
          const gain = (tp - operation.entryPrice) * operation.amount;
          balance += gain;
          operation.profit = gain;
          break;
        }
        // Se preço atingiu o stop loss
        if (priceLow <= sl) {
          operation.status = 'closed_sl';
          operation.exitPrice = sl;
          const loss = (sl - operation.entryPrice) * operation.amount;
          balance += loss;
          operation.profit = loss;
          break;
        }
      }
    }

    // Se acabou o dia e ainda estava aberto
    if (operation.status === 'opened') {
      const lastCandle = dayCandles[dayCandles.length - 1];
      operation.status = 'closed_by_time';
      operation.exitPrice = lastCandle.close;
      const result = (lastCandle.close - operation.entryPrice) * operation.amount;
      balance += result;
      operation.profit = result;
    }

    logs.push(operation);
    console.log(`📈 Dia ${date} finalizado: ${operation.status}`);
  }

  // Salva o resultado no JSON
  fs.writeFileSync('backtest_result.json', JSON.stringify(logs, null, 2));
  console.log('📝 Resultado salvo em backtest_result.json');

  // Estatísticas finais
  const totalTrades = logs.length;
  const wins = logs.filter(op => op.status === 'closed_tp').length;
  const losses = logs.filter(op => op.status === 'closed_sl').length;
  const closedByTime = logs.filter(op => op.status === 'closed_by_time').length;
  const totalProfit = logs.reduce((sum, op) => sum + op.profit, 0);

  console.log('📊 Estatísticas finais:');
  console.log(`- Total de Trades: ${totalTrades}`);
  console.log(`- Vitórias (Take Profit): ${wins}`);
  console.log(`- Derrotas (Stop Loss): ${losses}`);
  console.log(`- Fechamentos por Tempo: ${closedByTime}`);
  console.log(`- Lucro/Prejuízo Final: $${totalProfit.toFixed(2)}`);
  console.log(`- Saldo Final: $${balance.toFixed(2)}`);
}

// Executa o backtest
runBacktest();
