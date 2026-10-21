import { updateBookingForActor } from '../../functions/src/backend/bookings'
import { parseInput, updateBookingInputSchema } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(updateBookingInputSchema, body),
    run: (profile, input) => updateBookingForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }
