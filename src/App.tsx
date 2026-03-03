
import { ClothSimulation } from './components/ClothScene'

function App() {
  return (
    <div className="w-full h-screen bg-black">
      {/* <Canvas camera={{ position: [0, 2, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
        <ClothScene />
        <OrbitControls />
        <Environment preset="studio" />
      </Canvas> */}

      <div style={{ height: "100vh", width: "100vw" }}>  
        <ClothSimulation  
          width={window.innerWidth}  
          height={window.innerHeight}  
          backgroundColor="black"  
          lineColor="white"  
        />  
      </div>  
    </div>
  )
}

export default App
