import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, type Group, SRGBColorSpace, Vector3 } from 'three'

/** パネルの1単位[m]（2mm）。Canvas にはこの単位で描く */
const PIXEL_SIZE = 0.002

/** Canvas の解像度（1単位を何ピクセルで描くか） */
const RESOLUTION = 2

/** バスターの中心からどれだけ上に出すか[m] */
const PANEL_HEIGHT = 0.22

/** この距離[m]より離れたら出さない（遠くからは邪魔なだけなので） */
const VISIBLE_DISTANCE = 4

const FONT_STACK = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'

const TITLE = 'ポンコツバスター'

const LINES: readonly { label: string; text: string }[] = [
  { label: '持つ', text: 'G（スマホ「つかむ」・VR グリップ）' },
  { label: '撃つ', text: 'クリック（スマホ「使う」・VR トリガー）' },
  { label: 'ため', text: '長押しで弾が大きくなる' },
]

const PADDING_X = 10
const PADDING_Y = 8
const GAP = 4
const TITLE_SIZE = 13
const LABEL_SIZE = 9
const TEXT_SIZE = 10
const LINE_HEIGHT = 14
const LABEL_PADDING_X = 4
const LABEL_GAP = 6

const _panelPosition = new Vector3()
const _cameraPosition = new Vector3()

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

/** 操作説明を Canvas に描いて、テクスチャと大きさ[単位]を返す */
function drawPanel(): { texture: CanvasTexture; width: number; height: number } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context is not available')

  // 先に文字の幅を測って、パネルの大きさを決める
  ctx.font = `bold ${TITLE_SIZE}px ${FONT_STACK}`
  let contentWidth = ctx.measureText(TITLE).width
  const rows = LINES.map(({ label, text }) => {
    ctx.font = `${LABEL_SIZE}px ${FONT_STACK}`
    const labelWidth = ctx.measureText(label).width + LABEL_PADDING_X * 2
    ctx.font = `${TEXT_SIZE}px ${FONT_STACK}`
    const textWidth = ctx.measureText(text).width
    contentWidth = Math.max(contentWidth, labelWidth + LABEL_GAP + textWidth)
    return { label, text, labelWidth }
  })
  const width = Math.ceil(contentWidth + PADDING_X * 2)
  const height = PADDING_Y * 2 + LINE_HEIGHT * (LINES.length + 1) + GAP * LINES.length

  canvas.width = width * RESOLUTION
  canvas.height = height * RESOLUTION
  ctx.scale(RESOLUTION, RESOLUTION)
  ctx.textBaseline = 'middle'

  ctx.fillStyle = 'rgba(31, 38, 51, 0.85)'
  roundRect(ctx, 0, 0, width, height, 8)

  let y = PADDING_Y + LINE_HEIGHT / 2
  ctx.font = `bold ${TITLE_SIZE}px ${FONT_STACK}`
  ctx.fillStyle = '#c8ff6a'
  ctx.fillText(TITLE, PADDING_X, y)

  for (const { label, text, labelWidth } of rows) {
    y += LINE_HEIGHT + GAP
    ctx.fillStyle = '#3a4456'
    roundRect(ctx, PADDING_X, y - LINE_HEIGHT / 2 + 1, labelWidth, LINE_HEIGHT - 2, 3)
    ctx.font = `${LABEL_SIZE}px ${FONT_STACK}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, PADDING_X + LABEL_PADDING_X, y)
    ctx.font = `${TEXT_SIZE}px ${FONT_STACK}`
    ctx.fillStyle = '#e6e6e6'
    ctx.fillText(text, PADDING_X + labelWidth + LABEL_GAP, y)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return { texture, width, height }
}

/**
 * 置いてあるバスターの上に出す操作説明。いつもこちらを向く。
 * 誰かが持っている間は Item 側で外す（onGrab / onRelease で切り替える。
 * 0.64.0 以降は children そのものが手元に動くので、外さないと手元に出てしまう）
 *
 * 文字は Canvas に描いて普通のマテリアルで貼る。uikit の文字マテリアルは
 * material.clone() するとフォントを失って描画時に落ちる（配置プレビューで複製される）ため使わない
 */
export function HowToPanel() {
  const groupRef = useRef<Group>(null)
  const panel = useMemo(drawPanel, [])

  useEffect(() => () => panel.texture.dispose(), [panel])

  useFrame(({ camera }) => {
    const group = groupRef.current
    if (!group) return
    group.getWorldPosition(_panelPosition)
    camera.getWorldPosition(_cameraPosition)
    group.visible = _panelPosition.distanceTo(_cameraPosition) < VISIBLE_DISTANCE
  })

  return (
    <group ref={groupRef} position={[0, PANEL_HEIGHT, 0]}>
      <Billboard>
        <mesh>
          <planeGeometry args={[panel.width * PIXEL_SIZE, panel.height * PIXEL_SIZE]} />
          <meshBasicMaterial map={panel.texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
