import cron from 'node-cron';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { config } from './config.js';
import Operation from './models/Operation.js';
import { fetchOHLCV, getCurrentPrice, placeLimitBuy, placeMarketSell, checkOrderStatus, placeLimitSell } from './services/exchange.js';
import { calculateFibonacci } from './utils/fibonacci.js';

dotenv.config();
await mongoose.connect(process.env.MONGO_URI);
console.log("🟢 Connected to MongoDB");

cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    let operation = await Operation.findOne({ date: currentDate });

    console.log("⏳ Aguardando vela de 01:00");

    // Criar operação do dia
    if (!operation) {
      const candles = await fetchOHLCV(config.symbol, config.timeframe);

      // 🔍 Remove a última vela (que ainda está em formação)
      const previousCandles = candles.slice(0, -1);

      const now = new Date();
      const currentDateUTC = now.toISOString().split('T')[0];
      
      // 🔎 Encontra a vela de 01:00 UTC
      const candle0100 = previousCandles.find(c => {
        const candleDate = new Date(c.time);
        const candleDateStr = candleDate.toISOString().split('T')[0];
        return (
          candleDate.getUTCHours() === 1 &&
          candleDateStr === currentDateUTC
        );
      });

     
    if (!candle0100) {
      /*candles.forEach(c => {
        const candleDate = new Date(c.time);
        console.log(`🕯 Vela: ${candleDate.toISOString()} | Open: ${c.open} | High: ${c.high} | Low: ${c.low} | Close: ${c.close}`);
      });*/
      return console.log("⏳ Aguardando vela de 01:00 fechada");
    }
    
    // ✅ Verificação de sanidade dos dados
    if (candle0100.high === candle0100.low) {
      return console.log("⚠️ Candle inválido: high igual a low");
    }

      //✅ Log para comparação com a vela da Binance
        console.log(`🕐 Candle 01:00 UTC:
          🟢 Open: ${candle0100.open}
          🔴 Close: ${candle0100.close}
          🔺 High: ${candle0100.high}
          🔻 Low: ${candle0100.low}
          📦 Volume: ${candle0100.volume}`);

          const levels = calculateFibonacci(candle0100.high, candle0100.low);
          operation = await Operation.create({
            date: currentDate,
            fibonacciLevels: levels,
            breakEvenMoved: false
          });
        
          console.log("📊 Fibonacci traçado:", levels);
          return;
    }

    const price = await getCurrentPrice(config.symbol);

    // Entrada
    if (operation.status === 'waiting' && price <= operation.fibonacciLevels.entry) {
      const order = await placeLimitBuy(config.symbol, operation.fibonacciLevels.entry, config.riskAmount / operation.fibonacciLevels.entry); // ✅ atribuição feita aqui
      operation.status = 'pending';
      operation.orderId = order.id;
      await operation.save();
      return console.log(`📝 Ordem LIMIT de compra enviada a ${operation.fibonacciLevels.entry}`);
    }
    

    if (operation.status === 'pending') {
      const order = await checkOrderStatus(operation.orderId, config.symbol);
      if (order && order.status === 'closed') {
        operation.status = 'opened';
        operation.entryPrice = order.average || order.price;
        operation.timestampEntry = now;
        await operation.save();
        return console.log(`✅ Ordem LIMIT executada a ${operation.entryPrice}`);
      }
      if (!order) {
         return console.log("❌ Erro ao verificar a ordem. Aguardando próximo ciclo...");
      }

      return console.log("⌛ Aguardando execução da ordem LIMIT...");
    }
    

    // Break-even
    if (
      operation.status === 'opened' &&
      !operation.breakEvenMoved &&
      price >= operation.fibonacciLevels.fib100
    ) {
      const adjustedBreakEven = operation.fibonacciLevels.fib0718 * 1.002;
      operation.fibonacciLevels.sl = adjustedBreakEven;
      operation.breakEvenMoved = true;
      await operation.save();
      console.log("🔁 Stop movido para break-even (fib0718)");
    }

    // Saída por TP
    if (operation.status === 'opened' && price >= operation.fibonacciLevels.tp) {
      await placeLimitSell(config.symbol, operation.fibonacciLevels.tp, config.riskAmount / operation.entryPrice);
      operation.status = 'closed_tp';
      operation.exitPrice = price;
      operation.timestampExit = now;
      await operation.save();
      return console.log("🎯 Take profit atingido a", price);
    }

    // Saída por SL
    if (operation.status === 'opened' && price <= operation.fibonacciLevels.sl) {
      await placeLimitSell(config.symbol, operation.fibonacciLevels.sl, config.riskAmount / operation.entryPrice);
      operation.status = 'closed_sl';
      operation.exitPrice = price;
      operation.timestampExit = now;
      await operation.save();
      return console.log("🛑 Stop loss atingido a", price);
    }

    // Fechar por tempo
    if (operation.status === 'opened' && now.getUTCHours() === 23 && now.getUTCMinutes() === 59) {
      await placeMarketSell(config.symbol, config.riskAmount / operation.entryPrice);
      operation.status = 'closed_by_time';
      operation.exitPrice = price;
      operation.timestampExit = now;
      await operation.save();
      return console.log("⌛ Fechando posição por tempo a", price);
    }

  } catch (err) {
    console.error("❌ Erro no bot:", err.message);
  }
});
