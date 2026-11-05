import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { AdditiveBlending, type Group, type MeshBasicMaterial } from 'three'
import {
  CHARGE_BALL_OFFSET,
  MUZZLE_OFFSET,
  SHOT_LIFETIME,
  SHOT_SPEED,
} from './constants'
import type { ShotLevel } from './utils'

export interface ShotData {
  key: number
  /** 銃口の位置（アイテムのローカル座標） */
  origin: [number, number, number]
  /** 飛ぶ向き（長さ 1） */
  direction: [number, number, number]
  level: ShotLevel
}

interface Props {
  shot: ShotData
  onDone: (key: number) => void
}

/** 強さごとの弾の大きさ[m]と色 */
const SHOT_LOOKS: Record<ShotLevel, { radius: number; color: string }> = {
  0: { radius: 0.025, color: '#ffd166' },
  1: { radius: 0.055, color: '#ff9a3c' },
  2: { radius: 0.26, color: '#c8ff6a' },
}

/** フルチャージ弾を銃口からどれだけ前に出すか[m]（ためていた光の玉の位置から飛び出す） */
const BIG_SHOT_START_AHEAD = CHARGE_BALL_OFFSET - MUZZLE_OFFSET

/** 弾ひとつ。まっすぐ飛んで寿命で消える */
export function Shot({ shot, onDone }: Props) {
  const groupRef = useRef<Group>(null)
  const materialRef = useRef<MeshBasicMaterial>(null)
  const ageRef = useRef(0)
  const doneRef = useRef(false)

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group || doneRef.current) return
    ageRef.current += delta
    const age = ageRef.current
    const lifetime = SHOT_LIFETIME
    if (age >= lifetime) {
      doneRef.current = true
      onDone(shot.key)
      return
    }

    const [ox, oy, oz] = shot.origin
    // 最初のフレームは位置が決まってから出す（大きい弾が一瞬だけ銃口に重ならないように）
    group.visible = true
    const [dx, dy, dz] = shot.direction
    // 大きい弾は、ためていた光の玉の位置から出す
    const distance = (shot.level === 2 ? BIG_SHOT_START_AHEAD : 0) + age * SHOT_SPEED
    group.position.set(ox + dx * distance, oy + dy * distance, oz + dz * distance)
    // フルチャージ弾はぶるぶる大きさが揺れる
    if (shot.level === 2) group.scale.setScalar(1 + Math.sin(age * 40) * 0.12)
    if (materialRef.current) materialRef.current.opacity = 1 - age / lifetime
  })

  const look = SHOT_LOOKS[shot.level]
  return (
    <group ref={groupRef} position={shot.origin} visible={false}>
      <mesh>
        <sphereGeometry args={[look.radius, 16, 12]} />
        <meshBasicMaterial ref={materialRef} color={look.color} transparent toneMapped={false} />
      </mesh>
      {shot.level === 2 && (
        <>
          {/* フルチャージ弾は芯を白く、外側にうっすら光の膜をまとう */}
          <mesh>
            <sphereGeometry args={[look.radius * 0.55, 16, 12]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[look.radius * 1.5, 20, 14]} />
            <meshBasicMaterial
              color={look.color}
              transparent
              opacity={0.25}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </>
      )}
    </group>
  )
}
