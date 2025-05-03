export function calculateFibonacci(high, low) {
  const range = high - low;
  return {
    entry: high - range * 0.618,
    sl: low - range * 0.618,
    tp: high + range * 1.618,
    fib100: high - range * 1,
    fib0718: high + range * 0.718
  };
}

  