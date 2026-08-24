package com.disciplineos.domain.usecase

import com.disciplineos.domain.model.ActiveLease
import com.disciplineos.domain.repository.PolicyRepository
import com.disciplineos.domain.repository.SessionRepository

class CheckIsAppBlockedUseCase(
    private val policyRepository: PolicyRepository,
    private val sessionRepository: SessionRepository
) {
    suspend operator fun invoke(packageName: String): Boolean {
        // 1. If not in blocked apps list, allow
        if (!policyRepository.isAppBlocked(packageName)) {
            return false
        }

        // 2. If blocked, check if there is an active unexpired lease
        val lease = sessionRepository.getActiveLeaseForIdentifier(packageName)
        if (lease != null && !lease.isExpired) {
            return false // Unlocked by lease
        }

        return true // Blocked!
    }
}

class CheckIsDomainBlockedUseCase(
    private val policyRepository: PolicyRepository,
    private val sessionRepository: SessionRepository
) {
    suspend operator fun invoke(domain: String): Boolean {
        if (!policyRepository.isDomainBlocked(domain)) {
            return false
        }

        val lease = sessionRepository.getActiveLeaseForIdentifier(domain)
        if (lease != null && !lease.isExpired) {
            return false
        }

        return true
    }
}

class SpendUnlockUseCase(
    private val sessionRepository: SessionRepository
) {
    suspend operator fun invoke(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
        return sessionRepository.requestUnlock(identifier, type, seconds)
    }
}

class EmergencyUnlockUseCase(
    private val sessionRepository: SessionRepository
) {
    suspend operator fun invoke(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
        return sessionRepository.requestEmergencyUnlock(identifier, type, seconds)
    }
}
