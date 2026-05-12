class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "bits", defaultValue: 16, minValue: 1, maxValue: 16 },
      { name: "wet", defaultValue: 0, minValue: 0, maxValue: 1 },
    ];
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0];
    const out = outputs[0];
    if (!inp || !inp.length) return true;
    const bitsArr = parameters.bits;
    const wetArr = parameters.wet;
    for (let ch = 0; ch < Math.min(inp.length, out.length); ch++) {
      const src = inp[ch];
      const dst = out[ch];
      for (let i = 0; i < src.length; i++) {
        const bits = bitsArr.length > 1 ? bitsArr[i] : bitsArr[0];
        const wet = wetArr.length > 1 ? wetArr[i] : wetArr[0];
        const step = Math.pow(2, -(bits - 1));
        const crushed = Math.round(src[i] / step) * step;
        dst[i] = src[i] * (1 - wet) + crushed * wet;
      }
    }
    return true;
  }
}

registerProcessor("bitcrusher", BitcrusherProcessor);
