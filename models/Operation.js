import mongoose from 'mongoose';

const operationSchema = new mongoose.Schema({
  date: { type: String, required: true },
  fibonacciLevels: {
    entry: Number,
    sl: Number,
    tp: Number,
    fib100: Number,
    fib0718: Number
  },
  status: { type: String, default: 'waiting' },
  entryPrice: Number,
  exitPrice: Number,
  timestampEntry: Date,
  timestampExit: Date,
  breakEvenMoved: { type: Boolean, default: false }
});


export default mongoose.model('Operation', operationSchema);
