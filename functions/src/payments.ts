import { onCall } from 'firebase-functions/v2/https'
import { recordOrderPaymentForActor } from './backend/payments'
import type { RecordOrderPaymentInput } from './backend/validation'
import { requireActor } from './context'
import { throwHttpsError } from './errors'
import {
  parseInput,
  recordOrderPaymentInputSchema,
} from './validation'

const REGION = 'us-central1'

export const recordOrderPayment = onCall({ region: REGION }, async (request) => {
  try {
    const profile = await requireActor(request)
    const input = parseInput<RecordOrderPaymentInput>(
      recordOrderPaymentInputSchema,
      request.data,
    )
    return await recordOrderPaymentForActor(profile, input)
  } catch (error) {
    throwHttpsError(error)
  }
})
