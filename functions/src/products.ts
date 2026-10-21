import { onCall } from 'firebase-functions/v2/https'
import { adjustProductStockForActor } from './backend/products'
import type { AdjustProductStockInput } from './backend/validation'
import { requireActor } from './context'
import { throwHttpsError } from './errors'
import {
  adjustProductStockInputSchema,
  parseInput,
} from './validation'

const REGION = 'us-central1'

export const adjustProductStock = onCall({ region: REGION }, async (request) => {
  try {
    const profile = await requireActor(request)
    const input = parseInput<AdjustProductStockInput>(
      adjustProductStockInputSchema,
      request.data,
    )
    return await adjustProductStockForActor(profile, input)
  } catch (error) {
    throwHttpsError(error)
  }
})
