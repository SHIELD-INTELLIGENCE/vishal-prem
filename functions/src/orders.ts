import { onCall } from 'firebase-functions/v2/https'
import { createOrderForActor, cancelOrderForActor } from './backend/orders'
import type { CancelOrderInput, CreateOrderInput } from './backend/validation'
import { requireActor } from './context'
import { throwHttpsError } from './errors'
import {
  cancelOrderInputSchema,
  createOrderInputSchema,
  parseInput,
} from './validation'

const REGION = 'us-central1'

export const createOrder = onCall({ region: REGION }, async (request) => {
  try {
    const profile = await requireActor(request)
    const input = parseInput<CreateOrderInput>(createOrderInputSchema, request.data)
    return await createOrderForActor(profile, input)
  } catch (error) {
    throwHttpsError(error)
  }
})

export const cancelOrder = onCall({ region: REGION }, async (request) => {
  try {
    const profile = await requireActor(request)
    const input = parseInput<CancelOrderInput>(cancelOrderInputSchema, request.data)
    return await cancelOrderForActor(profile, input)
  } catch (error) {
    throwHttpsError(error)
  }
})
