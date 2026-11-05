import { Color } from 'three'
import type { GrabbableTransform } from '@xrift/world-components'

/** 置いた場所から少し浮かせる（アイテムの原点からのローカル座標） */
export const INITIAL_TRANSFORM: GrabbableTransform = {
  position: { x: 0, y: 0.4, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
}

/** 銃口の位置（持っている物のローカル -Z が前） */
export const MUZZLE_OFFSET = 0.2

/**
 * ためている光の玉の位置。銃口より前に出す
 * （自分の目線だと、銃口ぴったりでは筒に隠れて見えない）
 */
export const CHARGE_BALL_OFFSET = 0.34

/** ためた秒数で決まる弾の強さの境目[秒] */
export const CHARGE_MEDIUM_SECONDS = 0.5
export const CHARGE_FULL_SECONDS = 1.5

/**
 * 押してから溜めの演出（光・音）を出し始めるまで[秒]。
 * 連打で小さい弾を撃っている間に、溜めの光がチラ見えしないように
 */
export const CHARGE_EFFECT_DELAY = 0.35

/** 弾の速さ[m/s]と寿命[秒] */
export const SHOT_SPEED = 20
export const SHOT_LIFETIME = 1.2


/**
 * ほかの人がためている様子を、知らせが途切れたら止めるまで[秒]
 * （ためている途中でその人が抜けると、離した知らせが来ないため）
 */
export const REMOTE_CHARGE_TIMEOUT = 6

/** ためているときの光の色（ため始め → フルチャージ） */
export const CHARGE_GLOW_EMPTY = new Color('#ff9a3c')
export const CHARGE_GLOW_FULL = new Color('#c8ff6a')

/** ほかの人の音が聞こえなくなる距離[m]（近いほど大きく聞こえる） */
export const HEARING_DISTANCE = 20
