import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, type Group, type Mesh, MeshBasicMaterial } from 'three'

export interface HitData {
  key: number
  /** 当たった位置（アイテムのローカル座標） */
  position: [number, number, number]
  /** HP が 0 になった（大きく爆発する） */
  isKo: boolean
}

interface Props {
  hit: HitData
  onDone: (key: number) => void
}

/** 光っている長さ[秒]と大きさ（倒れたときは大きく長く） */
const LOOKS = {
  hit: { lifetime: 0.45, scale: 1, spark: '#ff4d4d' },
  ko: { lifetime: 0.9, scale: 2.8, spark: '#ff9a3c' },
} as const

/** 飛び散る粒の数と向き（いつも同じ散り方でよいので、先に決めておく） */
const SPARK_COUNT = 14
const SPARK_DIRECTIONS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const theta = i * 2.39996 // 黄金角でまんべんなく散らす
  const y = 1 - (i / (SPARK_COUNT - 1)) * 2
  const r = Math.sqrt(1 - y * y)
  return [Math.cos(theta) * r, y, Math.sin(theta) * r] as const
})

/** 粒が飛ぶ距離[m] */
const SPARK_DISTANCE = 0.45

/** 当たったところで、白い光がはじけて赤い粒が飛び散る（倒れたときは大きな爆発） */
export function HitEffect({ hit, onDone }: Props) {
  const flashRef = useRef<Mesh>(null)
  const sparksRef = useRef<Group>(null)
  const ageRef = useRef(0)
  const doneRef = useRef(false)
  const look = hit.isKo ? LOOKS.ko : LOOKS.hit
  const materials = useMemo(
    () => ({
      flash: new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
      spark: new MeshBasicMaterial({
        color: look.spark,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    }),
    [look],
  )

  useFrame((_, delta) => {
    if (doneRef.current) return
    ageRef.current += delta
    const t = ageRef.current / look.lifetime
    if (t >= 1) {
      doneRef.current = true
      materials.flash.dispose()
      materials.spark.dispose()
      onDone(hit.key)
      return
    }
    const fade = 1 - t
    flashRef.current?.scale.setScalar(0.3 + t * 1.2)
    materials.flash.opacity = fade * fade
    materials.spark.opacity = fade
    // 勢いよく飛び出して、だんだん止まる
    const distance = SPARK_DISTANCE * (1 - fade * fade)
    sparksRef.current?.children.forEach((spark, i) => {
      const [x, y, z] = SPARK_DIRECTIONS[i]
      spark.position.set(x * distance, y * distance, z * distance)
    })
  })

  return (
    <group position={hit.position} scale={look.scale}>
      <mesh ref={flashRef} material={materials.flash}>
        <sphereGeometry args={[0.2, 16, 12]} />
      </mesh>
      <group ref={sparksRef}>
        {SPARK_DIRECTIONS.map((_, i) => (
          <mesh key={i} material={materials.spark}>
            <sphereGeometry args={[0.025, 6, 4]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
