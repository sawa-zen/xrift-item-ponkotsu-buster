import type { ShotLevel } from './utils'

/**
 * ポンコツバスターの効果音。音声ファイルは使わず、その場で合成する。
 * AudioContext はページに1つだけ作って、置いた全部のバスターで使い回す
 * （ブラウザは AudioContext の数に上限があり、作りすぎると鳴らなくなる）
 */

/** 全体の音量（0〜1） */
const MASTER_VOLUME = 0.35

let context: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

/** AudioContext を用意する（最初に鳴らすときに作る。作れない環境では null） */
function getAudio(): { ctx: AudioContext; out: GainNode } | null {
  try {
    if (!context || context.state === 'closed') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      context = new AudioContextClass()
      master = context.createGain()
      master.gain.value = MASTER_VOLUME
      master.connect(context.destination)
      noiseBuffer = null
    }
    // 操作の直後に呼ばれるので、止まっていればここで動かす
    if (context.state === 'suspended') void context.resume()
    if (!master) return null
    return { ctx: context, out: master }
  } catch {
    return null
  }
}

/** ザーッという雑音（1秒ぶん。使い回す） */
function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

/** 雑音を鳴らす（filterFrequency 付近だけを通す） */
function playNoise(
  ctx: AudioContext,
  out: AudioNode,
  { duration, volume, filterFrequency }: { duration: number; volume: number; filterFrequency: number },
): void {
  const now = ctx.currentTime
  const source = ctx.createBufferSource()
  source.buffer = getNoise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = filterFrequency
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
  source.connect(filter).connect(gain).connect(out)
  source.start(now)
  source.stop(now + duration)
}

/** 音程が下がっていく電子音（ピュン） */
function playSweep(
  ctx: AudioContext,
  out: AudioNode,
  {
    type,
    from,
    to,
    duration,
    volume,
  }: { type: OscillatorType; from: number; to: number; duration: number; volume: number },
): void {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, now)
  osc.frequency.exponentialRampToValueAtTime(to, now + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
  osc.connect(gain).connect(out)
  osc.start(now)
  osc.stop(now + duration)
}

/** 聞く人までの距離に合わせた音量（volume: 0〜1）で鳴らす出口を作る */
function withVolume(ctx: AudioContext, out: GainNode, volume: number): GainNode {
  const gain = ctx.createGain()
  gain.gain.value = volume
  gain.connect(out)
  return gain
}

/** 撃った音。強さで変える（豆粒はピッ、ふつうはピュン、フルチャージはドーン） */
export function playShotSound(level: ShotLevel, volume: number): void {
  const audio = getAudio()
  if (!audio || volume <= 0) return
  const { ctx } = audio
  const out = withVolume(ctx, audio.out, volume)
  if (level === 0) {
    playSweep(ctx, out, { type: 'square', from: 1400, to: 500, duration: 0.09, volume: 0.25 })
    return
  }
  if (level === 1) {
    playSweep(ctx, out, { type: 'square', from: 900, to: 180, duration: 0.2, volume: 0.35 })
    playNoise(ctx, out, { duration: 0.12, volume: 0.25, filterFrequency: 3000 })
    return
  }
  playSweep(ctx, out, { type: 'sawtooth', from: 420, to: 40, duration: 0.6, volume: 0.6 })
  playSweep(ctx, out, { type: 'square', from: 1200, to: 200, duration: 0.25, volume: 0.25 })
  playNoise(ctx, out, { duration: 0.7, volume: 0.6, filterFrequency: 900 })
}

/** ためている音（止めるまで鳴り続ける） */
export interface ChargeSound {
  /** ためた割合（0〜1）を伝える。音が高く、うなりが速くなる */
  setRatio: (ratio: number) => void
  stop: () => void
}

/** ためている音を鳴らし始める。キュイイイン…と上がっていき、フルチャージでうなる */
export function startChargeSound(volume: number): ChargeSound | null {
  const audio = getAudio()
  if (!audio || volume <= 0) return null
  const { ctx } = audio
  const now = ctx.currentTime

  const out = withVolume(ctx, audio.out, 0)
  out.gain.linearRampToValueAtTime(volume * 0.22, now + 0.08)

  const tone = ctx.createOscillator()
  tone.type = 'sawtooth'
  tone.frequency.value = 160
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1200

  // 音量を揺らしてうならせる（ためるほど速く揺れる）
  const tremolo = ctx.createGain()
  tremolo.gain.value = 0.7
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 6
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.3
  lfo.connect(lfoDepth).connect(tremolo.gain)

  tone.connect(filter).connect(tremolo).connect(out)
  tone.start(now)
  lfo.start(now)

  let stopped = false
  return {
    setRatio: (ratio) => {
      if (stopped) return
      const t = ctx.currentTime
      tone.frequency.setTargetAtTime(160 + ratio * 740, t, 0.05)
      filter.frequency.setTargetAtTime(1200 + ratio * 2400, t, 0.05)
      lfo.frequency.setTargetAtTime(ratio >= 1 ? 22 : 6 + ratio * 10, t, 0.05)
    },
    stop: () => {
      if (stopped) return
      stopped = true
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setTargetAtTime(0, t, 0.02)
      tone.stop(t + 0.15)
      lfo.stop(t + 0.15)
    },
  }
}

/** 当たった音（バチッという破裂音と、低いドスッ） */
export function playHitSound(volume: number): void {
  const audio = getAudio()
  if (!audio || volume <= 0) return
  const { ctx } = audio
  const out = withVolume(ctx, audio.out, volume)
  playNoise(ctx, out, { duration: 0.18, volume: 0.7, filterFrequency: 6000 })
  playSweep(ctx, out, { type: 'triangle', from: 220, to: 50, duration: 0.25, volume: 0.6 })
  playSweep(ctx, out, { type: 'square', from: 1800, to: 900, duration: 0.06, volume: 0.2 })
}

/** 倒れた音（ドカーンという爆発と、しぼんでいく電子音） */
export function playKoSound(volume: number): void {
  const audio = getAudio()
  if (!audio || volume <= 0) return
  const { ctx } = audio
  const out = withVolume(ctx, audio.out, volume)
  playNoise(ctx, out, { duration: 1.1, volume: 0.9, filterFrequency: 700 })
  playSweep(ctx, out, { type: 'sawtooth', from: 160, to: 30, duration: 0.9, volume: 0.7 })
  playSweep(ctx, out, { type: 'square', from: 900, to: 60, duration: 0.8, volume: 0.25 })
}
