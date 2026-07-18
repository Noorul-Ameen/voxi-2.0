/*
 * Self-hosted from @elevenlabs/client 0.7.1 for strict-CSP AudioWorklet use.
 * ulaw encoding logic is used by the ElevenLabs browser client.
 */

const BIAS = 0x84;
const CLIP = 32635;
const encodeTable = [
  0,0,1,1,2,2,2,2,3,3,3,3,3,3,3,3,
  4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,
  5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
  5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
];

function encodeSample(sample) {
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  sample += BIAS;
  if (sample > CLIP) sample = CLIP;
  const exponent = encodeTable[(sample >> 7) & 0xFF];
  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  return ~(sign | (exponent << 4) | mantissa);
}

class RawAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case "setFormat":
          this.isMuted = false;
          this.buffer = [];
          this.bufferSize = data.sampleRate / 4;
          this.format = data.format;
          if (globalThis.LibSampleRate && sampleRate !== data.sampleRate) {
            globalThis.LibSampleRate.create(1, sampleRate, data.sampleRate).then((resampler) => {
              this.resampler = resampler;
            });
          }
          break;
        case "setMuted":
          this.isMuted = data.isMuted;
          break;
      }
    };
  }

  process(inputs) {
    if (!this.buffer) return true;
    const input = inputs[0];
    if (input.length > 0) {
      let channelData = input[0];
      if (this.resampler) channelData = this.resampler.full(channelData);
      this.buffer.push(...channelData);
      let sum = 0;
      for (let index = 0; index < channelData.length; index += 1) sum += channelData[index] * channelData[index];
      const maxVolume = Math.sqrt(sum / channelData.length);
      if (this.buffer.length >= this.bufferSize) {
        const float32Array = this.isMuted ? new Float32Array(this.buffer.length) : new Float32Array(this.buffer);
        const encodedArray = this.format === "ulaw" ? new Uint8Array(float32Array.length) : new Int16Array(float32Array.length);
        for (let index = 0; index < float32Array.length; index += 1) {
          const sample = Math.max(-1, Math.min(1, float32Array[index]));
          let value = sample < 0 ? sample * 32768 : sample * 32767;
          if (this.format === "ulaw") value = encodeSample(Math.round(value));
          encodedArray[index] = value;
        }
        this.port.postMessage([encodedArray, maxVolume]);
        this.buffer = [];
      }
    }
    return true;
  }
}

registerProcessor("rawAudioProcessor", RawAudioProcessor);
