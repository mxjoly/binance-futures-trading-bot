export type ActivationFunction = (x: number, derivative?: boolean) => number;

const logistic = (x: number, derivate?: boolean) => {
  var fx = 1 / (1 + Math.exp(-x));
  if (!derivate) return fx;
  return fx * (1 - fx);
};

const tanh = (x: number, derivate?: boolean) => {
  if (derivate) return 1 - Math.pow(Math.tanh(x), 2);
  return Math.tanh(x);
};

const identity = (x: number, derivate?: boolean) => {
  return derivate ? 1 : x;
};

const step = (x: number, derivate?: boolean) => {
  return derivate ? 0 : x > 0 ? 1 : 0;
};

const relu = (x: number, derivate?: boolean) => {
  if (derivate) return x > 0 ? 1 : 0;
  return x > 0 ? x : 0;
};

const softsign = (x: number, derivate?: boolean) => {
  var d = 1 + Math.abs(x);
  if (derivate) return x / Math.pow(d, 2);
  return x / d;
};

const sinusoid = (x: number, derivate?: boolean) => {
  if (derivate) return Math.cos(x);
  return Math.sin(x);
};

const gaussian = (x: number, derivate?: boolean) => {
  var d = Math.exp(-Math.pow(x, 2));
  if (derivate) return -2 * x * d;
  return d;
};

const bent_identity = (x: number, derivate?: boolean) => {
  var d = Math.sqrt(Math.pow(x, 2) + 1);
  if (derivate) return x / (2 * d) + 1;
  return (d - 1) / 2 + x;
};

const bipolar = (x: number, derivate?: boolean) => {
  return derivate ? 0 : x > 0 ? 1 : -1;
};

const bipolarSigmoid = (x: number, derivate?: boolean) => {
  var d = 2 / (1 + Math.exp(-x)) - 1;
  if (derivate) return (1 / 2) * (1 + d) * (1 - d);
  return d;
};

const hardTanh = (x: number, derivate?: boolean) => {
  if (derivate) return x > -1 && x < 1 ? 1 : 0;
  return Math.max(-1, Math.min(1, x));
};

const absolute = (x: number, derivate?: boolean) => {
  if (derivate) return x < 0 ? -1 : 1;
  return Math.abs(x);
};

const inverse = (x: number, derivate?: boolean) => {
  if (derivate) return -1;
  return 1 - x;
};

// https://arxiv.org/pdf/1706.02515.pdf
const selu = (x: number, derivate?: boolean) => {
  var alpha = 1.6732632423543772848170429916717;
  var scale = 1.0507009873554804934193349852946;
  var fx = x > 0 ? x : alpha * Math.exp(x) - alpha;
  if (derivate) {
    return x > 0 ? scale : (fx + alpha) * scale;
  }
  return fx * scale;
};

export {
  bipolar,
  bipolarSigmoid,
  gaussian,
  hardTanh,
  identity,
  inverse,
  logistic,
  relu,
  selu,
  sinusoid,
  softsign,
  step,
  tanh,
  absolute,
  bent_identity,
};
