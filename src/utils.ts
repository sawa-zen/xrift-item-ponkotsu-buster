import { CHARGE_EFFECT_DELAY, CHARGE_FULL_SECONDS, CHARGE_MEDIUM_SECONDS } from './constants'

/** 弾の強さ。0: 豆粒 / 1: ふつう / 2: フルチャージ */
export type ShotLevel = 0 | 1 | 2

/** ためた秒数から弾の強さを決める */
export function toShotLevel(chargeSeconds: number): ShotLevel {
  if (chargeSeconds >= CHARGE_FULL_SECONDS) return 2
  if (chargeSeconds >= CHARGE_MEDIUM_SECONDS) return 1
  return 0
}

/**
 * 溜めの演出の進み具合（0〜1）。光・ゲージ・音に使う。
 * 押してすぐ（CHARGE_EFFECT_DELAY まで）は 0 のまま（連打では演出を出さない）
 */
export function toChargeRatio(chargeSeconds: number): number {
  const ratio = (chargeSeconds - CHARGE_EFFECT_DELAY) / (CHARGE_FULL_SECONDS - CHARGE_EFFECT_DELAY)
  return Math.min(1, Math.max(0, ratio))
}
