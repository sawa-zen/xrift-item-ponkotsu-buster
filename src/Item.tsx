import {
  type GrabHoldEvent,
  type GrabUseEvent,
  Grabbable,
  useInstanceEvent,
  useItem,
  useUsers,
} from '@xrift/world-components'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Euler, type Group, Vector3 } from 'three'
import {
  createShotId,
  getMyHp,
  hitsBody,
  isArmed,
  MAX_HP,
  onMyHpChange,
  setHeldByMe,
  takeDamage,
} from './battle'
import {
  BusterModel,
  type ChargeState,
  type HpState,
  nowSeconds,
  readChargeSeconds,
} from './BusterModel'
import { HEARING_DISTANCE, INITIAL_TRANSFORM, MUZZLE_OFFSET } from './constants'
import { HitEffect, type HitData } from './HitEffect'
import { HowToPanel } from './HowToPanel'
import { Shot, type ShotData } from './Shot'
import {
  type ChargeSound,
  playHitSound,
  playKoSound,
  playShotSound,
  startChargeSound,
} from './sound'
import { toChargeRatio, toShotLevel } from './utils'

/** ほかの人へ送る知らせ（送った本人には届かないので、自分の画面には直接出す） */
type BusterEvent =
  | { type: 'charge'; position: [number, number, number] }
  | { type: 'shot'; shot: SentShot }
  /** 撃たれた人が「自分に当たった」と知らせる（position はアイテムのローカル座標。isKo は HP が 0 になった） */
  | { type: 'hit'; shotId: string; position: [number, number, number]; isKo: boolean }
  /** 持っている人の HP（このバスターのランプに出す） */
  | { type: 'hp'; hp: number }

/** 送る弾（key と isMine は受け取った側で付ける） */
type SentShot = Omit<ShotData, 'key' | 'isMine'>

/** 自分で撃つ音の大きさ（ほかの人の音は距離で小さくなる） */
const OWN_VOLUME = 1

const _direction = new Vector3()
const _soundPosition = new Vector3()
const _listenerPosition = new Vector3()
const _euler = new Euler()
const _hitPosition = new Vector3()

/** ためている状態を書き換える（毎フレーム BusterModel が同じオブジェクトを読むので、作り直さない） */
function setCharge(charge: ChargeState, startedAt: number | null, isRemote: boolean): void {
  charge.startedAt = startedAt
  charge.isRemote = isRemote
}

/**
 * ポンコツバスター。掴んで「使う」を押している間ためて、離すと撃つ。
 * - PC はクリック、スマホは「使う」ボタン、VR は持っている手のトリガー
 * - ためている間は、銃口の前に光の玉がふくらみ、まわりから光の粒が集まる
 * - 溜めの光と音は、押して少し経ってから出す（連打で小さい弾を撃つ間は出さない）
 * - ためている音・撃った音を鳴らす（ほかの人の音は距離で小さくなる）
 * - ためた長さで弾が3段階に大きくなる
 * - 弾とためている様子は useInstanceEvent でほかの人にも見せる
 *   （onUseStart / onUseEnd は持っている本人の画面でだけ呼ばれるため）
 * - 置いてある間は上に操作説明を出す（onGrab / onRelease で切り替え、持つと消える）
 * - 持っている間は children そのものが持ち主の手元に動く（0.64.0 以降）
 * - ID は設置ごとに変える（2つ置いても別の物として持てる・知らせも混ざらない）
 * - 持っている人同士でバトルできる（battle.ts）。当たると HP が減り、0 で爆発して満タンに戻る
 *   当たり判定は撃たれた側が行い、当たったら全員に知らせる。フルチャージ弾は貫通する
 * - 持っている人の HP はバスターのランプに出す（持ち主が知らせるので全員に見える）
 */
export const Item = () => {
  const { id } = useItem()
  const chargeRef = useRef<ChargeState>({ startedAt: null, isRemote: false })
  const hpRef = useRef<HpState>({ value: MAX_HP })
  /** 自分が持っている（自分の HP をランプに出して、ほかの人に知らせる） */
  const heldByMeRef = useRef(false)
  const [shots, setShots] = useState<ShotData[]>([])
  const [hits, setHits] = useState<HitData[]>([])
  /** 誰かが持っている（持っている間は操作説明を出さない） */
  const [isHeld, setIsHeld] = useState(false)
  const nextKeyRef = useRef(0)
  const groupRef = useRef<Group>(null)
  const chargeSoundRef = useRef<ChargeSound | null>(null)
  /** いま溜めている人の音を、自分が聞く大きさ（自分なら 1、ほかの人なら距離で決める） */
  const chargeVolumeRef = useRef(OWN_VOLUME)
  const camera = useThree((state) => state.camera)
  const { getLocalMovement, getLocalAvatarHeight } = useUsers()

  /** アイテムのローカル座標で鳴った音の、自分が聞く大きさ（遠いほど小さく、遠すぎると 0） */
  const volumeAt = useCallback(
    ([x, y, z]: [number, number, number]) => {
      const group = groupRef.current
      if (!group) return 0
      group.localToWorld(_soundPosition.set(x, y, z))
      camera.getWorldPosition(_listenerPosition)
      const ratio = 1 - _soundPosition.distanceTo(_listenerPosition) / HEARING_DISTANCE
      return Math.max(0, ratio) ** 2
    },
    [camera],
  )

  const stopChargeSound = useCallback(() => {
    chargeSoundRef.current?.stop()
    chargeSoundRef.current = null
  }, [])

  // 溜めの音を、押して少し経ってから鳴らし始め、溜めた長さで高くする
  // （ためていない・ほかの人の知らせが途切れたら止める）
  useFrame(() => {
    const seconds = readChargeSeconds(chargeRef.current)
    if (seconds === null) {
      if (chargeSoundRef.current) stopChargeSound()
      return
    }
    const ratio = toChargeRatio(seconds)
    if (ratio <= 0) return
    if (!chargeSoundRef.current) chargeSoundRef.current = startChargeSound(chargeVolumeRef.current)
    chargeSoundRef.current?.setRatio(ratio)
  })

  // 片付けるときに鳴りっぱなしにしない
  useEffect(() => stopChargeSound, [stopChargeSound])

  const addShot = useCallback((shot: SentShot, isMine: boolean) => {
    const key = nextKeyRef.current++
    setShots((prev) => [...prev, { ...shot, key, isMine }])
  }, [])

  const removeShot = useCallback((key: number) => {
    setShots((prev) => prev.filter((shot) => shot.key !== key))
  }, [])

  /** 当たった弾を消す（フルチャージ弾は貫通するので残す） */
  const removeHitShot = useCallback((shotId: string) => {
    setShots((prev) => prev.filter((shot) => shot.id !== shotId || shot.level === 2))
  }, [])

  const addHit = useCallback((position: [number, number, number], isKo: boolean) => {
    const key = nextKeyRef.current++
    setHits((prev) => [...prev, { key, position, isKo }])
  }, [])

  const removeHit = useCallback((key: number) => {
    setHits((prev) => prev.filter((hit) => hit.key !== key))
  }, [])

  // 片付けるときに、持っていた扱いを残さない
  useEffect(() => () => setHeldByMe(id, false), [id])

  const emit = useInstanceEvent<BusterEvent>(`ponkotsu-buster:${id}`, ({ payload }) => {
    if (payload.type === 'hp') {
      hpRef.current.value = payload.hp
      return
    }
    if (payload.type === 'hit') {
      removeHitShot(payload.shotId)
      addHit(payload.position, payload.isKo)
      const volume = volumeAt(payload.position)
      if (payload.isKo) playKoSound(volume)
      else playHitSound(volume)
      return
    }
    if (payload.type === 'charge') {
      setCharge(chargeRef.current, nowSeconds(), true)
      stopChargeSound()
      chargeVolumeRef.current = volumeAt(payload.position)
      return
    }
    setCharge(chargeRef.current, null, false)
    stopChargeSound()
    playShotSound(payload.shot.level, volumeAt(payload.shot.origin))
    addShot(payload.shot, false)
  })

  /** ほかの人の弾が、持っている自分に当たったか（当たったら光らせて、全員に知らせる） */
  const checkHit = useCallback(
    (shot: ShotData, worldPosition: Vector3, radius: number) => {
      if (shot.isMine || !isArmed()) return false
      const height = getLocalAvatarHeight?.().height
      if (!hitsBody(worldPosition, radius, getLocalMovement().position, height)) return false
      const group = groupRef.current
      if (!group) return false
      // 倒れて戻るのを待っている間は当たらない（弾はそのまま通り抜ける）
      const result = takeDamage(shot.level)
      if (!result) return false
      const isKo = result === 'ko'
      group.worldToLocal(_hitPosition.copy(worldPosition))
      const position: [number, number, number] = [_hitPosition.x, _hitPosition.y, _hitPosition.z]
      removeHitShot(shot.id)
      addHit(position, isKo)
      if (isKo) playKoSound(OWN_VOLUME)
      else playHitSound(OWN_VOLUME)
      emit({ type: 'hit', shotId: shot.id, position, isKo })
      return true
    },
    [addHit, emit, getLocalAvatarHeight, getLocalMovement, removeHitShot],
  )

  const handleUseStart = useCallback(
    ({ transform: { position } }: GrabUseEvent) => {
      setCharge(chargeRef.current, nowSeconds(), false)
      stopChargeSound()
      chargeVolumeRef.current = OWN_VOLUME
      emit({ type: 'charge', position: [position.x, position.y, position.z] })
    },
    [emit, stopChargeSound],
  )

  const handleUseEnd = useCallback(
    ({ transform }: GrabUseEvent) => {
      const seconds = readChargeSeconds(chargeRef.current)
      setCharge(chargeRef.current, null, false)
      stopChargeSound()
      if (seconds === null) return

      const level = toShotLevel(seconds)
      // 持っている物の前（-Z）へ撃つ。transform はアイテムのローカル座標
      const { rotation, position } = transform
      _direction.set(0, 0, -1).applyEuler(_euler.set(rotation.x, rotation.y, rotation.z))
      const shot: SentShot = {
        id: createShotId(),
        origin: [
          position.x + _direction.x * MUZZLE_OFFSET,
          position.y + _direction.y * MUZZLE_OFFSET,
          position.z + _direction.z * MUZZLE_OFFSET,
        ],
        direction: [_direction.x, _direction.y, _direction.z],
        level,
      }
      playShotSound(level, OWN_VOLUME)
      addShot(shot, true)
      emit({ type: 'shot', shot })
    },
    [addShot, emit, stopChargeSound],
  )

  // onGrab / onRelease は全員の画面で呼ばれるので、ほかの人が持っている間も操作説明が消える
  /** 自分の HP をランプに出して、ほかの人にも知らせる */
  const showMyHp = useCallback(
    (hp: number) => {
      hpRef.current.value = hp
      emit({ type: 'hp', hp })
    },
    [emit],
  )

  // 持っている間は、自分の HP が変わるたびにランプを合わせる
  useEffect(
    () =>
      onMyHpChange((hp) => {
        if (heldByMeRef.current) showMyHp(hp)
      }),
    [showMyHp],
  )

  // 自分が持ったときだけ参戦する
  const handleGrab = useCallback(
    ({ isMine }: GrabHoldEvent) => {
      setIsHeld(true)
      if (!isMine) return
      heldByMeRef.current = true
      setHeldByMe(id, true)
      showMyHp(getMyHp())
    },
    [id, showMyHp],
  )
  const handleRelease = useCallback(
    ({ isMine }: GrabHoldEvent) => {
      setIsHeld(false)
      if (!isMine) return
      heldByMeRef.current = false
      setHeldByMe(id, false)
    },
    [id],
  )

  return (
    <group ref={groupRef}>
      <Grabbable
        id={`ponkotsu-buster:${id}`}
        transform={INITIAL_TRANSFORM}
        onUseStart={handleUseStart}
        onUseEnd={handleUseEnd}
        onGrab={handleGrab}
        onRelease={handleRelease}
      >
        <BusterModel charge={chargeRef.current} hp={hpRef.current} />
        {!isHeld && <HowToPanel />}
      </Grabbable>
      {shots.map((shot) => (
        <Shot key={shot.key} shot={shot} onDone={removeShot} checkHit={checkHit} />
      ))}
      {hits.map((hit) => (
        <HitEffect key={hit.key} hit={hit} onDone={removeHit} />
      ))}
    </group>
  )
}
