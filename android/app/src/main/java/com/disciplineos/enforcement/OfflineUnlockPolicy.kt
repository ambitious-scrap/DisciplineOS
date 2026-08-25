package com.disciplineos.enforcement

import com.disciplineos.domain.model.ActiveLease

object OfflineUnlockPolicy {
    const val DISABLED_MESSAGE = "Offline distraction unlock is disabled until server-signed reserve capabilities are available"

    fun reject(): Result<ActiveLease> = Result.failure(IllegalStateException(DISABLED_MESSAGE))
}
