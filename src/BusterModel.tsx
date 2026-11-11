import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  type Group,
  type Mesh,
  MeshBasicMaterial,
} from 'three'
import {
  CHARGE_GLOW_EMPTY,
  CHARGE_GLOW_FULL,
  CHARGE_BALL_OFFSET,
  REMOTE_CHARGE_TIMEOUT,
} from './constants'
import { MAX_HP } from './battle'
import { toChargeRatio } from './utils'

/** ためている状態（再描画せずに毎フレーム読むので、オブジェクトを書き換えて使う） */
export interface ChargeState {
  /** ため始めた時刻[秒]（performance.now 基準）。ためていなければ null */
  startedAt: number | null
  /** ほかの人がためている（知らせが途切れたら止める） */
  isRemote: boolean
}

/** バスターのランプが示す HP（持っている人の HP。再描画せずに毎フレーム読む） */
export interface HpState {
  value: number
}

interface Props {
  charge: ChargeState
  hp: HpState
}

/** HP ランプの並び（筒の上、ゲージより前に一列） */
const LAMP_START_Z = -0.025
const LAMP_SPACING = 0.022
const LAMP_Y = 0.061

/** ランプの色（残りが少ないほど赤く、最後の1つは点滅する） */
const LAMP_OFF = new Color('#2b2b2b')
const LAMP_HIGH = new Color('#5dff7a')
const LAMP_MIDDLE = new Color('#ffd23f')
const LAMP_LOW = new Color('#ff3b3b')

function lampColor(hp: number): Color {
  if (hp >= 3) return LAMP_HIGH
  if (hp === 2) return LAMP_MIDDLE
  return LAMP_LOW
}

const HALF_PI = Math.PI / 2

/** ゲージの針の振れ幅（左端→右端）[rad] */
const NEEDLE_SWING = Math.PI * 0.8

/** 銃口へ吸い込まれる光の粒の数・どこから来るか[m] */
const SPARK_COUNT = 10
const SPARK_START_RADIUS = 0.35

/** 光の粒が来る向き（銃口のまわりに散らす。毎回同じ並び） */
const SPARK_DIRECTIONS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * Math.PI * 2
  const tilt = ((i * 7) % SPARK_COUNT) / SPARK_COUNT - 0.5
  return [Math.cos(angle), Math.sin(angle), tilt] as const
})

const _glow = new Color()

export const nowSeconds = () => performance.now() / 1000

/** いまためている秒数（ためていなければ null） */
export function readChargeSeconds(charge: ChargeState): number | null {
  if (charge.startedAt === null) return null
  const seconds = nowSeconds() - charge.startedAt
  if (charge.isRemote && seconds > REMOTE_CHARGE_TIMEOUT) return null
  return seconds
}

/**
 * ポンコツバスターの見た目。前は -Z（持つと視線の向き）。
 * 継ぎ当てした筒・ゆがんだ銃口・ガムテープで留めた帯・色違いのボルト。
 * 腕に差し込んで使う（持ち手は無い）。
 * ためている間は銃口の前に光の玉がふくらんでゲージの針が上がり、フルチャージでガタガタ震える
 */
export function BusterModel({ charge, hp }: Props) {
  const bodyRef = useRef<Group>(null)
  const glowRef = useRef<Mesh>(null)
  const needleRef = useRef<Group>(null)
  const sparksRef = useRef<Group>(null)
  // 光の粒の材質は1つを使い回して、色をまとめて変える
  const sparkMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => sparkMaterial.dispose(), [sparkMaterial])
  // ランプはひとつずつ色を変えるので、材質を分ける
  const lampMaterials = useMemo(
    () => Array.from({ length: MAX_HP }, () => new MeshBasicMaterial({ toneMapped: false })),
    [],
  )
  useEffect(() => () => lampMaterials.forEach((material) => material.dispose()), [lampMaterials])

  useFrame(({ clock }) => {
    const seconds = readChargeSeconds(charge)
    const ratio = seconds === null ? 0 : toChargeRatio(seconds)

    const glow = glowRef.current
    if (glow) {
      glow.visible = ratio > 0
      // ためるほど大きく、フルチャージは脈打つ（銃に隠れて見えなくならないよう大げさに）
      const pulse = ratio >= 1 ? 1 + Math.sin(clock.elapsedTime * 30) * 0.15 : 1
      glow.scale.setScalar((0.4 + ratio * 2.2) * pulse)
      _glow.copy(CHARGE_GLOW_EMPTY).lerp(CHARGE_GLOW_FULL, ratio)
      ;(glow.material as MeshBasicMaterial).color.copy(_glow)
    }

    // 銃口のまわりから光の粒が吸い込まれる（ためるほど速い）
    const sparks = sparksRef.current
    if (sparks) {
      sparks.visible = seconds !== null && ratio > 0
      if (seconds !== null && ratio > 0) {
        const speed = 1.2 + ratio * 2.5
        sparks.children.forEach((spark, i) => {
          const phase = (seconds * speed + i / SPARK_COUNT) % 1
          const [x, y, z] = SPARK_DIRECTIONS[i]
          const r = SPARK_START_RADIUS * (1 - phase)
          spark.position.set(x * r, y * r, z * r)
          spark.scale.setScalar(0.4 + phase * 0.8)
        })
        sparkMaterial.color.copy(_glow)
      }
    }

    // HP ランプ（残っている数だけ点ける。残り1つは点滅）
    const blink = hp.value === 1 && Math.sin(clock.elapsedTime * 12) < 0
    const lit = lampColor(hp.value)
    lampMaterials.forEach((material, i) => {
      material.color.copy(i < hp.value && !blink ? lit : LAMP_OFF)
    })

    if (needleRef.current) needleRef.current.rotation.z = NEEDLE_SWING / 2 - ratio * NEEDLE_SWING

    // フルチャージでガタガタ震える（ポンコツなので）
    const body = bodyRef.current
    if (body) {
      const shake = ratio >= 1 ? 0.004 : 0
      body.position.set(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
      )
    }
  })

  return (
    <group ref={bodyRef}>
      {/* 筒（前だけ少し細い） */}
      <mesh rotation={[HALF_PI, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.055, 0.3, 14]} />
        <meshStandardMaterial color="#6b7d4f" metalness={0.5} roughness={0.7} />
      </mesh>
      {/* 継ぎ当て（ふさいだ穴） */}
      <mesh position={[0.045, 0.03, -0.03]} scale={[0.4, 1, 1.3]}>
        <sphereGeometry args={[0.03, 10, 8]} />
        <meshStandardMaterial color="#56653f" metalness={0.5} roughness={0.8} />
      </mesh>
      {/* 腕を差し込む口（ふちと、奥の暗がり） */}
      <mesh position={[0, 0, 0.152]}>
        <torusGeometry args={[0.057, 0.01, 8, 16]} />
        <meshStandardMaterial color="#3e4a2e" metalness={0.6} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.12]}>
        <circleGeometry args={[0.052, 16]} />
        <meshStandardMaterial color="#15180f" roughness={1} />
      </mesh>
      {/* ゆがんだ銃口 */}
      <mesh position={[0, 0, -0.155]} rotation={[0.12, 0.08, 0]}>
        <torusGeometry args={[0.058, 0.014, 8, 16]} />
        <meshStandardMaterial color="#a0522d" metalness={0.4} roughness={0.9} />
      </mesh>
      {/* ガムテープで留めた帯 */}
      <mesh position={[0, 0, 0.03]} rotation={[HALF_PI, 0, 0.3]}>
        <cylinderGeometry args={[0.063, 0.063, 0.045, 14]} />
        <meshStandardMaterial color="#b9b4a6" roughness={1} />
      </mesh>
      {/* 色違いのボルト */}
      <mesh position={[-0.058, 0.015, 0.1]}>
        <sphereGeometry args={[0.009, 8, 6]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[-0.058, 0.015, -0.08]}>
        <sphereGeometry args={[0.011, 8, 6]} />
        <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0.05, -0.03, 0.11]}>
        <sphereGeometry args={[0.008, 8, 6]} />
        <meshStandardMaterial color="#7a3b2e" metalness={0.7} roughness={0.5} />
      </mesh>
      {/* 圧力ゲージ（上に付いた丸い計器と針） */}
      <group position={[0, 0.07, 0.07]} rotation={[-HALF_PI * 0.6, 0, 0]}>
        <mesh rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.012, 16]} />
          <meshStandardMaterial color="#efe9d8" roughness={0.6} />
        </mesh>
        <group ref={needleRef} position={[0, 0, 0.007]}>
          <mesh position={[0, 0.009, 0]}>
            <boxGeometry args={[0.003, 0.018, 0.002]} />
            <meshBasicMaterial color="#d32f2f" />
          </mesh>
        </group>
      </group>
      {/* HP ランプ（減ると手元側から消えていく） */}
      {lampMaterials.map((material, i) => (
        <mesh
          key={i}
          position={[0, LAMP_Y, LAMP_START_Z - (MAX_HP - 1 - i) * LAMP_SPACING]}
          material={material}
        >
          <sphereGeometry args={[0.008, 10, 8]} />
        </mesh>
      ))}
      {/* 銃口の光（ためている間だけ） */}
      <mesh ref={glowRef} position={[0, 0, -CHARGE_BALL_OFFSET]} visible={false}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshBasicMaterial
          color={CHARGE_GLOW_EMPTY}
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </mesh>
      {/* 銃口へ吸い込まれる光の粒 */}
      <group ref={sparksRef} position={[0, 0, -CHARGE_BALL_OFFSET]} visible={false}>
        {SPARK_DIRECTIONS.map((_, i) => (
          <mesh key={i} material={sparkMaterial}>
            <sphereGeometry args={[0.008, 6, 4]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
