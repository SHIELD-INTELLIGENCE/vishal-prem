import type { CallableRequest } from 'firebase-functions/v2/https'
import type { UserProfile } from '../../src/types/models'
import { requireActorByUid } from './backend/context'
import { OperationError } from './backend/errors'
import { throwHttpsError } from './errors'

/**
 * Resolves the legacy callable actor from the verified callable auth context.
 * The transport-neutral operation layer then receives the live profile.
 */
export async function requireActor(request: CallableRequest): Promise<UserProfile> {
  try {
    const uid = request.auth?.uid
    if (!uid) {
      throw new OperationError(
        'unauthenticated',
        'Sign in before making this request.',
      )
    }
    return await requireActorByUid(uid)
  } catch (error) {
    throwHttpsError(error)
  }
}

export {
  requireDepartmentScope,
  requireOutletScope,
  requirePermission,
} from './backend/context'
