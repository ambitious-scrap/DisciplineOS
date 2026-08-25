package com.disciplineos.domain.usecase

import com.disciplineos.domain.model.ActiveLease
import com.disciplineos.domain.repository.PolicyRepository
import com.disciplineos.domain.repository.SessionRepository

class CheckIsAppBlockedUseCase(
    private val policyRepository: PolicyRepository,
    private val sessionRepository: SessionRepository
) {
    suspend operator fun invoke(packageName: String): Boolean {
        if (!policyRepository.isAppBlocked(packageName)) {
            return false
        }

        val lease = sessionRepository.getActiveLeaseForIdentifier(packageName, "app")
        if (lease != null && !lease.isExpired) {
            return false
        }

        return true
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

        val lease = sessionRepository.getActiveLeaseForIdentifier(domain, "site")
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
