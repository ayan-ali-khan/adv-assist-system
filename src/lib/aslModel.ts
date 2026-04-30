import * as tf from '@tensorflow/tfjs'

/**
 * ASL Recognition Model using LSTM/GRU
 * This model processes sequences of hand landmarks (21 points × 3 coords = 63 features per frame)
 * and predicts ASL signs.
 *
 * For production, you would train this on a dataset like ASL-100 or similar.
 * For now, this is a placeholder architecture that can be loaded with pre-trained weights.
 */

const SEQUENCE_LENGTH = 30 // Number of frames to consider for a sign
const LANDMARK_DIM = 63 // 21 landmarks × 3 (x, y, z)
const NUM_CLASSES = 26 // A-Z for now (can be extended)

let model: tf.LayersModel | null = null

export async function loadASLModel(): Promise<tf.LayersModel> {
  if (model) return model

  // Build LSTM model architecture
  model = tf.sequential({
    layers: [
      // Input: (sequence_length, landmark_dim)
      tf.layers.lstm({
        units: 128,
        returnSequences: true,
        inputShape: [SEQUENCE_LENGTH, LANDMARK_DIM],
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.lstm({
        units: 64,
        returnSequences: false,
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 32, activation: 'relu' }),
      tf.layers.dense({ units: NUM_CLASSES, activation: 'softmax' }),
    ],
  })

  // Compile model
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  })

  // Attempt to load a pre-trained model from /models/asl-lstm-model.json.
  // If the file is not present the architecture above is used with random
  // weights and predictions will be meaningless — provide a real trained
  // model exported via model.save('downloads://asl-lstm-model') to fix this.
  try {
    const loaded = await tf.loadLayersModel('/models/asl-lstm-model.json')
    model = loaded
    console.info('[ASL] Pre-trained model loaded.')
  } catch {
    console.warn(
      '[ASL] No pre-trained model found at /models/asl-lstm-model.json. ' +
      'Predictions will be random until a real trained model is provided.',
    )
  }

  return model
}

export function predictASLSign(landmarkSequence: number[][]): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      if (!model) {
        await loadASLModel()
      }

      if (!model) {
        resolve('Model not ready')
        return
      }

      // Pad or truncate sequence to SEQUENCE_LENGTH
      const padded = Array(SEQUENCE_LENGTH)
        .fill(null)
        .map((_, i) => {
          if (i < landmarkSequence.length) {
            return landmarkSequence[i]
          }
          // Pad with zeros if sequence is shorter
          return Array(LANDMARK_DIM).fill(0)
        })
        .slice(0, SEQUENCE_LENGTH)

      // Convert to tensor: [1, SEQUENCE_LENGTH, LANDMARK_DIM]
      const input = tf.tensor3d([padded])

      // Predict
      const prediction = model.predict(input) as tf.Tensor
      const probs = await prediction.data()
      prediction.dispose()
      input.dispose()

      // Find class with highest probability
      let maxIdx = 0
      let maxProb = probs[0]
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > maxProb) {
          maxProb = probs[i]
          maxIdx = i
        }
      }

      // Map index to letter (A=0, B=1, ..., Z=25)
      const letter = String.fromCharCode(65 + maxIdx) // 'A' = 65

      // Only return if confidence is reasonable
      if (maxProb > 0.3) {
        resolve(letter)
      } else {
        resolve('?') // Uncertain
      }
    } catch (e) {
      console.error('ASL prediction error:', e)
      resolve('?')
    }
  })
}

/**
 * Convert hand landmarks to feature vector (63 features: 21 landmarks × 3 coords)
 */
export function landmarksToFeatures(landmarks: Array<{ x: number; y: number; z: number }>): number[] {
  const features: number[] = []
  for (const lm of landmarks) {
    features.push(lm.x, lm.y, lm.z)
  }
  // Pad to 63 if needed (should be exactly 21 landmarks = 63 features)
  while (features.length < 63) {
    features.push(0, 0, 0)
  }
  return features.slice(0, 63)
}
