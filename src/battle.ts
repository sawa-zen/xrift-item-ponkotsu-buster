import type { Position3D } from '@xrift/world-components'
import type { Vector3 } from 'three'
import type { ShotLevel } from './utils'

/**
 * 持っている人同士のバトル
 * - 当たると HP が減る。0 になると爆発して、少し経つと満タンに戻る（勝ち負けは無い）
 * - 当たり判定は撃たれた側が自分の画面で行う（弾は全員の画面で同じように飛んでいるので、
 *   自分の体に重なったら「当たった」を全員に知らせる）
 * - 自分がどれかのバスターを持っている間だけ当たる（見ているだけの人には当たらない）
 */

/** 自分が持っているバスターの id（2つ置いてあっても、どれか1つでも持っていれば参戦中） */
const heldByMe = new Set<string>()

export function setHeldByMe(itemId: string, held: boolean): void {
  if (held) heldByMe.add(itemId)
  else heldByMe.delete(itemId)
}

/** 自分が参戦中か（どれかのバスターを持っている） */
export const isArmed = (): boolean => heldByMe.size > 0

/** 体の当たり判定（足元から頭までの縦長のカプセル）[m] */
const BODY_RADIUS = 0.25
const BODY_BOTTOM = 0.3
const DEFAULT_BODY_HEIGHT = 1.6

/** 弾（中心・半径）が、足元が feet にいる人の体に重なっているか */
export function hitsBody(
  shot: Vector3,
  shotRadius: number,
  feet: Position3D,
  bodyHeight = DEFAULT_BODY_HEIGHT,
): boolean {
  const bottom = feet.y + BODY_BOTTOM
  const top = feet.y + Math.max(bodyHeight - BODY_RADIUS, BODY_BOTTOM)
  const nearestY = Math.min(Math.max(shot.y, bottom), top)
  const dx = shot.x - feet.x
  const dy = shot.y - nearestY
  const dz = shot.z - feet.z
  const reach = BODY_RADIUS + shotRadius
  return dx * dx + dy * dy + dz * dz < reach * reach
}

/** 弾の id（撃った人ごとにかぶらないように、ランダムに作る） */
export const createShotId = (): string => Math.random().toString(36).slice(2, 12)

/** HP の最大値（バスターのランプの数） */
export const MAX_HP = 5

/** 弾の強さごとに減る HP */
const SHOT_DAMAGE: Record<ShotLevel, number> = { 0: 1, 1: 2, 2: 3 }

/** 倒れてから満タンに戻るまで[ミリ秒]（その間は当たらない） */
const KO_RECOVER_MS = 1500

/** 自分の HP（持ち替えても引き継ぐ） */
let myHp = MAX_HP
const hpListeners = new Set<(hp: number) => void>()

export const getMyHp = (): number => myHp

/** 自分の HP が変わったら呼ぶ。戻り値で解除する */
export function onMyHpChange(listener: (hp: number) => void): () => void {
  hpListeners.add(listener)
  return () => {
    hpListeners.delete(listener)
  }
}

function setMyHp(hp: number): void {
  myHp = hp
  hpListeners.forEach((listener) => listener(hp))
}

/**
 * 弾が当たったときに HP を減らす。
 * 倒れたら 'ko'、減っただけなら 'hit'、倒れて戻るのを待っている間（当たらない）は null
 */
export function takeDamage(level: ShotLevel): 'hit' | 'ko' | null {
  if (myHp <= 0) return null
  const hp = Math.max(0, myHp - SHOT_DAMAGE[level])
  setMyHp(hp)
  if (hp > 0) return 'hit'
  setTimeout(() => setMyHp(MAX_HP), KO_RECOVER_MS)
  return 'ko'
}
