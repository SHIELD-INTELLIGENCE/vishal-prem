import { onCall } from 'firebase-functions/v2/https'
import {
  adjustProductStockForActor,
  enableProductStockTrackingForActor,
} from './backend/products'
import type {
  AdjustProductStockInput,
  EnableProductStockTrackingInput,
} from './backend/validation'
import { requireActor } from './context'
import { throwHttpsError } from './errors'
import {
  adjustProductStockInputSchema,
  enableProductStockTrackingInputSchema,
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

export const enableProductStockTracking = onCall({ region: REGION }, async (request) => {
  try {
    const profile = await requireActor(request)
    const input = parseInput<EnableProductStockTrackingInput>(
      enableProductStockTrackingInputSchema,
      request.data,
    )
    return await enableProductStockTrackingForActor(profile, input)
  } catch (error) {
    throwHttpsError(error)
  }
})
