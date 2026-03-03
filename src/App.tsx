import { ClothSimulation } from './components/ClothScene'

function App() {
  return (
    <div className="w-screen h-screen bg-white flex flex-row items-center justify-center gap-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex-1 h-full">
          <ClothSimulation
            backgroundColor="white"
            textureSrc={`/flag${i}.jpg`}
          />
        </div>
      ))}
    </div>
  )
}

export default App