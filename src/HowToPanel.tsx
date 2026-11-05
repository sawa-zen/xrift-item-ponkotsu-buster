import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Container, Text } from '@react-three/uikit'
import { useDefaultFont } from '@xrift/world-components'
import { useRef } from 'react'
import { type Group, Vector3 } from 'three'

/** UIKit の1単位[m]（2mm） */
const PIXEL_SIZE = 0.002

/** バスターの中心からどれだけ上に出すか[m] */
const PANEL_HEIGHT = 0.22

/** この距離[m]より離れたら出さない（遠くからは邪魔なだけなので） */
const VISIBLE_DISTANCE = 4

const FONT_LOCALES = ['ja' as const]

const LINES: readonly { label: string; text: string }[] = [
  { label: '持つ', text: 'G（スマホ「つかむ」・VR グリップ）' },
  { label: '撃つ', text: 'クリック（スマホ「使う」・VR トリガー）' },
  { label: 'ため', text: '長押しで弾が大きくなる' },
]

const _panelPosition = new Vector3()
const _cameraPosition = new Vector3()

/**
 * 置いてあるバスターの上に出す操作説明。いつもこちらを向く。
 * <Grabbable> の children の中に置くので、誰かが持っている間は実体ごと隠れる
 * （手元の代わりには renderGhost で見た目だけを渡しているので、手には出ない）
 */
export function HowToPanel() {
  const groupRef = useRef<Group>(null)
  const fontFamilies = useDefaultFont(FONT_LOCALES)

  useFrame(({ camera }) => {
    const group = groupRef.current
    if (!group) return
    group.getWorldPosition(_panelPosition)
    camera.getWorldPosition(_cameraPosition)
    group.visible = _panelPosition.distanceTo(_cameraPosition) < VISIBLE_DISTANCE
  })

  // フォントが届くまでは出さない（届く前は文字が豆腐になる）
  if (!fontFamilies) return null

  return (
    <group ref={groupRef} position={[0, PANEL_HEIGHT, 0]}>
      <Billboard>
        <Container
          pixelSize={PIXEL_SIZE}
          fontFamilies={fontFamilies}
          flexDirection="column"
          gap={4}
          paddingX={10}
          paddingY={8}
          borderRadius={8}
          backgroundColor="#1f2633"
          opacity={0.85}
        >
          <Text fontFamily="ja" fontSize={13} color="#c8ff6a">
            ポンコツバスター
          </Text>
          {LINES.map(({ label, text }) => (
            <Container key={label} flexDirection="row" gap={6} alignItems="center">
              <Container paddingX={4} borderRadius={3} backgroundColor="#3a4456">
                <Text fontFamily="ja" fontSize={9} color="#ffffff">
                  {label}
                </Text>
              </Container>
              <Text fontFamily="ja" fontSize={10} color="#e6e6e6">
                {text}
              </Text>
            </Container>
          ))}
        </Container>
      </Billboard>
    </group>
  )
}
