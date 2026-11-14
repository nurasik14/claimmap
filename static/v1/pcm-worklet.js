// AudioWorklet: downsample the context's native rate to 16 kHz mono and post ~100 ms Int16 frames.
// Box-filter (averaging) decimation: good enough for speech recognition, no dependencies.
const TARGET_RATE = 16000;
const FRAME = 1600; // 100 ms at 16 kHz

class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE; // input samples per output sample (>= 1 in practice)
    this.frame = new Int16Array(FRAME);
    this.n = 0;
    this.sum = 0;
    this.cnt = 0;
    this.pos = 0;
    this.sq = 0;
    this.sqn = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i];
      this.cnt++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = this.sum / this.cnt;
        this.sum = 0;
        this.cnt = 0;
        const s = v > 1 ? 1 : v < -1 ? -1 : v;
        this.frame[this.n++] = s < 0 ? s * 32768 : s * 32767;
        this.sq += v * v;
        this.sqn++;
        if (this.n === FRAME) {
          const buf = this.frame.buffer;
          this.port.postMessage({ pcm: buf, level: Math.sqrt(this.sq / this.sqn) }, [buf]);
          this.frame = new Int16Array(FRAME);
          this.n = 0;
          this.sq = 0;
          this.sqn = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-16k', Pcm16k);
