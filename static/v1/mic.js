// Microphone capture -> 16 kHz Int16 PCM frames via an AudioWorklet.

export class MicError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Resolves to {stop()}. Throws MicError with code 'unsupported' | 'denied' | 'nodevice' | 'failed'. */
export async function startMic({ onPcm, onLevel }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicError('unsupported', 'This browser cannot access the microphone here (it needs https or localhost).');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw new MicError('denied', e.message);
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') throw new MicError('nodevice', e.message);
    throw new MicError('failed', e.message || String(e));
  }
  let ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    await ctx.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm-16k', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.onmessage = (e) => {
      onPcm?.(e.data.pcm);
      onLevel?.(e.data.level);
    };
    const mute = ctx.createGain(); // keep the graph alive without playing the mic back
    mute.gain.value = 0;
    src.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    if (ctx.state === 'suspended') await ctx.resume();
    return {
      stop() {
        try { node.port.onmessage = null; src.disconnect(); node.disconnect(); } catch { /* already gone */ }
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        onLevel?.(0);
      },
    };
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    throw new MicError('failed', e.message || String(e));
  }
}
