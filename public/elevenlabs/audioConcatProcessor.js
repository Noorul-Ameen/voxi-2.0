/*
 * Self-hosted from @elevenlabs/client 0.7.1 for strict-CSP AudioWorklet use.
 * ulaw decoding logic is used by the ElevenLabs browser client.
 */

const decodeTable = [0, 132, 396, 924, 1980, 4092, 8316, 16764];

function decodeSample(muLawSample) {
  muLawSample = ~muLawSample;
  const sign = muLawSample & 0x80;
  const exponent = (muLawSample >> 4) & 0x07;
  const mantissa = muLawSample & 0x0F;
  const sample = decodeTable[exponent] + (mantissa << (exponent + 3));
  return sign !== 0 ? -sample : sample;
}

class AudioConcatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = [];
    this.cursor = 0;
    this.currentBuffer = null;
    this.wasInterrupted = false;
    this.finished = false;
    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case "setFormat":
          this.format = data.format;
          break;
        case "buffer":
          this.wasInterrupted = false;
          this.buffers.push(this.format === "ulaw" ? new Uint8Array(data.buffer) : new Int16Array(data.buffer));
          break;
        case "interrupt":
          this.wasInterrupted = true;
          break;
        case "clearInterrupted":
          if (this.wasInterrupted) {
            this.wasInterrupted = false;
            this.buffers = [];
            this.currentBuffer = null;
          }
          break;
      }
    };
  }

  process(_, outputs) {
    let finished = false;
    const output = outputs[0][0];
    for (let index = 0; index < output.length; index += 1) {
      if (!this.currentBuffer) {
        if (this.buffers.length === 0) {
          finished = true;
          break;
        }
        this.currentBuffer = this.buffers.shift();
        this.cursor = 0;
      }
      let value = this.currentBuffer[this.cursor];
      if (this.format === "ulaw") value = decodeSample(value);
      output[index] = value / 32768;
      this.cursor += 1;
      if (this.cursor >= this.currentBuffer.length) this.currentBuffer = null;
    }
    if (this.finished !== finished) {
      this.finished = finished;
      this.port.postMessage({ type: "process", finished });
    }
    return true;
  }
}

registerProcessor("audioConcatProcessor", AudioConcatProcessor);
