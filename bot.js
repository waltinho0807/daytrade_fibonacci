import cron from 'node-cron';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { config } from './config.js';
import Operation from './models/Operation.js';
import { fetchOHLCV, getCurrentPrice, placeMarketBuy, placeMarketSell } from './services/exchange.js';
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
      const currentDateUTC = new Date().toISOString().split('T')[0];

      const candle0100 = candles.find(c => {
      const candleDate = new Date(c.time);
      const candleDateUTC = candleDate.toISOString().split('T')[0];
      return candleDateUTC === currentDateUTC && candleDate.getUTCHours() === 1;
    });

    if (!candle0100) return console.log("⏳ Aguardando vela de 01:00");

    if (!candle0100) return console.log("⏳ Aguardando vela de 01:00");

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
      await placeMarketBuy(config.symbol, config.riskAmount / price);
      operation.status = 'opened';
      operation.entryPrice = price;
      operation.timestampEntry = now;
      await operation.save();
      return console.log("✅ Compra realizada a", price);
    }

    // Break-even
    if (
      operation.status === 'opened' &&
      !operation.breakEvenMoved &&
      price >= operation.fibonacciLevels.fib100
    ) {
      operation.fibonacciLevels.sl = operation.fibonacciLevels.fib0718;
      operation.breakEvenMoved = true;
      await operation.save();
      console.log("🔁 Stop movido para break-even (fib0718)");
    }

    // Saída por TP
    if (operation.status === 'opened' && price >= operation.fibonacciLevels.tp) {
      await placeMarketSell(config.symbol, config.riskAmount / operation.entryPrice);
      operation.status = 'closed_tp';
      operation.exitPrice = price;
      operation.timestampExit = now;
      await operation.save();
      return console.log("🎯 Take profit atingido a", price);
    }

    // Saída por SL
    if (operation.status === 'opened' && price <= operation.fibonacciLevels.sl) {
      await placeMarketSell(config.symbol, config.riskAmount / operation.entryPrice);
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
