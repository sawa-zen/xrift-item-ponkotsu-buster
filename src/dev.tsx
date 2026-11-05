/**
 * 開発環境用エントリーポイント
 *
 * ローカル開発時（npm run dev）に使用されます。
 * 本番ビルド（npm run build）では使用されません。
 *
 * DevEnvironment で XRift と同じ操作で試せます:
 * クリックでマウスを固定 → クロスヘアでバスターを狙って G で持つ →
 * クリックを押している間ためて、離すと撃つ（G でいまの位置に置く）
 */

import { RigidBody } from '@react-three/rapier'
import {
  createDefaultInstanceEventImplementation,
  DevEnvironment,
  InstanceEventProvider,
  ItemProvider,
} from '@xrift/world-components'
import { createRoot } from 'react-dom/client'
import { Item } from './Item'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

// useInstanceEvent の受け皿（開発ではほかの人がいないので、送っても誰にも届かない）
const instanceEvent = createDefaultInstanceEventImplementation()

createRoot(rootElement).render(
  <div style={{ width: '100vw', height: '100vh' }}>
    <DevEnvironment spawnPosition={[0, 1.6, 2]}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
      {/* 胸の高さの台の上に置く */}
      <group position={[0, 0.6, 0]}>
        <InstanceEventProvider value={instanceEvent}>
          <ItemProvider id="dev">
            <Item />
          </ItemProvider>
        </InstanceEventProvider>
      </group>
      {/* 地面 */}
      <RigidBody type="fixed">
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#7a7f86" />
        </mesh>
      </RigidBody>
    </DevEnvironment>
  </div>,
)
