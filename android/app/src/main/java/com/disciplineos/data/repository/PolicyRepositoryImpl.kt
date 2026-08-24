package com.disciplineos.data.repository

import com.disciplineos.data.local.dao.PolicyDao
import com.disciplineos.data.local.entity.BlockedAppEntity
import com.disciplineos.data.local.entity.BlockedSiteEntity
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.domain.model.BlockedApp
import com.disciplineos.domain.model.BlockedSite
import com.disciplineos.domain.repository.PolicyRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class PolicyRepositoryImpl(
    private val policyDao: PolicyDao,
    private val apiService: DisciplineApiService,
    private val tokenProvider: () -> String?
) : PolicyRepository {

    override fun getBlockedAppsFlow(): Flow<List<BlockedApp>> {
        return policyDao.getBlockedAppsFlow().map { entities ->
            entities.map {
                BlockedApp(
                    id = it.id,
                    packageName = it.packageName,
                    displayName = it.displayName,
                    isActive = it.isActive
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
                    isActive = it.isActive
                )
            }
        }
    }

    override suspend fun isAppBlocked(packageName: String): Boolean {
        return policyDao.isAppBlocked(packageName)
    }

    override suspend fun isDomainBlocked(domain: String): Boolean {
        return policyDao.isDomainBlocked(domain)
    }

    override suspend fun syncPolicy(): Result<Unit> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return try {
            val response = apiService.getPolicy("Bearer $token")
            if (response.isSuccessful && response.body() != null) {
                val profile = response.body()!!

                val appEntities = profile.blockedApps.map {
                    BlockedAppEntity(
                        id = it.id,
                        packageName = it.identifier,
                        displayName = it.displayName,
                        isActive = it.isActive
                    )
                }

                val siteEntities = profile.blockedSites.map {
                    BlockedSiteEntity(
                        id = it.id,
                        domain = it.domain,
                        isActive = it.isActive
                    )
                }

                policyDao.clearApps()
                policyDao.insertApps(appEntities)
                policyDao.clearSites()
                policyDao.insertSites(siteEntities)

                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to fetch policy: ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
