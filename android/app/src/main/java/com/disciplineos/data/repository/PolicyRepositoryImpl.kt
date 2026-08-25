package com.disciplineos.data.repository

import com.disciplineos.data.local.dao.PolicyDao
import com.disciplineos.data.local.entity.BlockedAppEntity
import com.disciplineos.data.local.entity.BlockedSiteEntity
import com.disciplineos.data.local.entity.PolicyMetadataEntity
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.CreateBlockedAppRequestDto
import com.disciplineos.data.remote.dto.CreateBlockedSiteRequestDto
import com.disciplineos.domain.model.BlockedApp
import com.disciplineos.domain.model.BlockedSite
import com.disciplineos.domain.model.PolicyCacheMetadata
import com.disciplineos.domain.repository.PolicyRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class PolicyRepositoryImpl(
    private val policyDao: PolicyDao,
    private val apiService: DisciplineApiService,
    private val tokenProvider: () -> String?,
) : PolicyRepository {

    override fun getBlockedAppsFlow(): Flow<List<BlockedApp>> {
        return policyDao.getBlockedAppsFlow().map { entities ->
            entities.map {
                BlockedApp(
                    id = it.id,
                    packageName = it.packageName,
                    displayName = it.displayName,
                    isActive = it.isActive,
                )
            }
        }
    }

    override fun getBlockedSitesFlow(): Flow<List<BlockedSite>> {
        return policyDao.getBlockedSitesFlow().map { entities ->
            entities.map {
                BlockedSite(
                    id = it.id,
                    domain = it.domain,
                    isActive = it.isActive,
                )
            }
        }
    }

    override suspend fun isAppBlocked(packageName: String): Boolean = policyDao.isAppBlocked(packageName)

    override suspend fun isDomainBlocked(domain: String): Boolean = policyDao.isDomainBlocked(domain)

    override suspend fun getPolicyMetadata(): PolicyCacheMetadata {
        val metadata = policyDao.getPolicyMetadata()
        return PolicyCacheMetadata(metadata?.revision ?: 0, metadata?.syncedAtEpochMs)
    }

    override suspend fun syncPolicy(): Result<Unit> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return runCatching {
            val response = apiService.getPolicy("Bearer $token")
            val profile = response.body() ?: error("Failed to fetch policy: ${response.code()} ${response.message()}")
            val current = getPolicyMetadata()
            require(profile.version >= current.revision) {
                "Refusing stale policy revision ${profile.version}; cached revision is ${current.revision}"
            }

            val appEntities = profile.blockedApps.map {
                BlockedAppEntity(
                    id = it.id,
                    packageName = it.identifier,
                    displayName = it.displayName,
                    isActive = it.isActive,
                )
            }
            val siteEntities = profile.blockedSites.map {
                BlockedSiteEntity(
                    id = it.id,
                    domain = it.domain,
                    isActive = it.isActive,
                )
            }
            policyDao.replacePolicy(
                apps = appEntities,
                sites = siteEntities,
                metadata = PolicyMetadataEntity(
                    revision = profile.version,
                    syncedAtEpochMs = System.currentTimeMillis(),
                ),
            )
        }
    }

    override suspend fun addApp(packageName: String, displayName: String): Result<Unit> {
        return requestPolicyMutation { token ->
            apiService.addBlockedApp(
                "Bearer $token",
                CreateBlockedAppRequestDto(identifier = packageName, displayName = displayName),
            )
        }
    }

    override suspend fun addSite(domain: String): Result<Unit> {
        return requestPolicyMutation { token ->
            apiService.addBlockedSite(
                "Bearer $token",
                CreateBlockedSiteRequestDto(domain),
            )
        }
    }

    override suspend fun requestRemoveApp(id: String): Result<Unit> {
        return requestPolicyMutation { token -> apiService.requestRemoveBlockedApp("Bearer $token", id) }
    }

    override suspend fun requestRemoveSite(id: String): Result<Unit> {
        return requestPolicyMutation { token -> apiService.requestRemoveBlockedSite("Bearer $token", id) }
    }

    private suspend fun requestPolicyMutation(
        request: suspend (token: String) -> retrofit2.Response<*>,
    ): Result<Unit> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return runCatching {
            val response = request(token)
            check(response.isSuccessful) { "Policy mutation failed: ${response.code()} ${response.message()}" }
            syncPolicy().getOrThrow()
        }
    }
}
