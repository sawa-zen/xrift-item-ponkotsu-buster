import {
  type GrabUseEvent,
  Grabbable,
  useInstanceEvent,
  useItem,
} from '@xrift/world-components'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Euler, type Group, Vector3 } from 'three'
import { BusterModel, type ChargeState, nowSeconds, readChargeSeconds } from './BusterModel'
import { HEARING_DISTANCE, INITIAL_TRANSFORM, MUZZLE_OFFSET } from './constants'
import { HowToPanel } from './HowToPanel'
import { Shot, type ShotData } from './Shot'
import { type ChargeSound, playShotSound, startChargeSound } from './sound'
import { toChargeRatio, toShotLevel } from './utils'

/** ほかの人へ送る知らせ（送った本人には届かないので、自分の画面には直接出す） */
type BusterEvent =
  | { type: 'charge'; position: [number, number, number] }
  | { type: 'shot'; shot: Omit<ShotData, 'key'> }

/** 自分で撃つ音の大きさ（ほかの人の音は距離で小さくなる） */
const OWN_VOLUME = 1

const _direction = new Vector3()
const _soundPosition = new Vector3()
const _listenerPosition = new Vector3()
const _euler = new Euler()

/** ためている状態を書き換える（実体と手元の代わりが同じオブジェクトを読むので、作り直さない） */
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
 * - 置いてある間は上に操作説明を出す（持つと消える）
 * - ID は設置ごとに変える（2つ置いても別の物として持てる・知らせも混ざらない）
 */
export const Item = () => {
  const { id } = useItem()
  const chargeRef = useRef<ChargeState>({ startedAt: null, isRemote: false })
  const [shots, setShots] = useState<ShotData[]>([])
  const nextKeyRef = useRef(0)
  const groupRef = useRef<Group>(null)
  const chargeSoundRef = useRef<ChargeSound | null>(null)
  /** いま溜めている人の音を、自分が聞く大きさ（自分なら 1、ほかの人なら距離で決める） */
  const chargeVolumeRef = useRef(OWN_VOLUME)
  const camera = useThree((state) => state.camera)

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

  const addShot = useCallback((shot: Omit<ShotData, 'key'>) => {
    const key = nextKeyRef.current++
    setShots((prev) => [...prev, { ...shot, key }])
  }, [])

  const removeShot = useCallback((key: number) => {
    setShots((prev) => prev.filter((shot) => shot.key !== key))
  }, [])

  const emit = useInstanceEvent<BusterEvent>(`ponkotsu-buster:${id}`, ({ payload }) => {
    if (payload.type === 'charge') {
      setCharge(chargeRef.current, nowSeconds(), true)
      stopChargeSound()
      chargeVolumeRef.current = volumeAt(payload.position)
      return
    }
    setCharge(chargeRef.current, null, false)
    stopChargeSound()
    playShotSound(payload.shot.level, volumeAt(payload.shot.origin))
    addShot(payload.shot)
  })

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
      const shot: Omit<ShotData, 'key'> = {
        origin: [
          position.x + _direction.x * MUZZLE_OFFSET,
          position.y + _direction.y * MUZZLE_OFFSET,
          position.z + _direction.z * MUZZLE_OFFSET,
        ],
        direction: [_direction.x, _direction.y, _direction.z],
        level,
      }
      playShotSound(level, OWN_VOLUME)
      addShot(shot)
      emit({ type: 'shot', shot })
    },
    [addShot, emit, stopChargeSound],
  )

  // 手元には見た目だけ出す（操作説明は置いてある間だけ）
  const renderGhost = useCallback(() => <BusterModel charge={chargeRef.current} />, [])

  return (
    <group ref={groupRef}>
      <Grabbable
        id={`ponkotsu-buster:${id}`}
        transform={INITIAL_TRANSFORM}
        onUseStart={handleUseStart}
        onUseEnd={handleUseEnd}
        renderGhost={renderGhost}
      >
        <BusterModel charge={chargeRef.current} />
        <HowToPanel />
      </Grabbable>
      {shots.map((shot) => (
        <Shot key={shot.key} shot={shot} onDone={removeShot} />
      ))}
    </group>
  )
}
