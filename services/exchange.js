import ccxt from 'ccxt';
import dotenv from 'dotenv';
dotenv.config();

const exchange = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  enableRateLimit: true,
});

export async function fetchOHLCV(symbol, timeframe) {
  const candles = await exchange.fetchOHLCV(symbol, timeframe);
  return candles.map(c => ({
    time: c[0],
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5]
  }));
}

export async function getCurrentPrice(symbol) {
  const ticker = await exchange.fetchTicker(symbol);
  return ticker.last;
}

export async function placeMarketBuy(symbol, amount) {
  return await exchange.createMarketBuyOrder(symbol, amount);
}

export async function placeMarketSell(symbol, amount) {
  return await exchange.createMarketSellOrder(symbol, amount);
}

export async function placeLimitBuy(symbol, price, amount) {
  const roundedPrice = parseFloat(price.toFixed(2)); // Ajuste baseado no par (ex: 2 casas para USDT pairs)
  return await exchange.createLimitBuyOrder(symbol, amount, roundedPrice);
}

export async function placeLimitSell(symbol, price, amount) {
  const roundedPrice = parseFloat(price.toFixed(2));
  return await exchange.createLimitSellOrder(symbol, amount, roundedPrice);
}

export async function checkOrderStatus(orderId, symbol) {
  return await exchange.fetchOrder(orderId, symbol);
}

