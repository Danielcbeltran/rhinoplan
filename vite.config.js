import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El runtime WASM de onnxruntime-web se carga desde el CDN de jsDelivr en
// tiempo de ejecución (ver ort.env.wasm.wasmPaths en cefalometria/detectors/
// custom.ts). Vite copia igualmente ~26 MB de .wasm al dist porque el paquete
// los referencia como assets. Como nunca se sirven desde nuestro dominio, este
// plugin los descarta del bundle final: aligera el despliegue sin afectar la
// detección (el .wasm sigue viniendo del CDN).
function dropOnnxWasm() {
  return {
    name: 'drop-onnx-wasm',
    generateBundle(_options, bundle) {
      for (const file of Object.keys(bundle)) {
        if (/ort-.*\.wasm$/.test(file) || (file.endsWith('.wasm') && /onnx|ort-/.test(file))) {
          delete bundle[file]
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), dropOnnxWasm()],
})
