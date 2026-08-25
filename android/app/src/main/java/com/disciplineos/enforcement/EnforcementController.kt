package com.disciplineos.enforcement

import android.content.Context
import com.disciplineos.domain.model.ActiveLease
import com.disciplineos.domain.model.BlockedApp
import com.disciplineos.receiver.DisciplineDeviceAdminReceiver

interface EnforcementController {
    suspend fun reconcile(
        blockedApps: List<BlockedApp>,
        validLeases: List<ActiveLease>,
        protectionState: ProtectionState,
    )
    suspend fun blockPackage(packageName: String)
    suspend fun allowPackageTemporarily(packageName: String)
}

internal fun deriveSuspensionPlan(
    blockedPackages: Set<String>,
    leasedPackages: Set<String>,
    managedPackages: Set<String>,
): Map<String, Boolean> {
    return (blockedPackages + leasedPackages + managedPackages).associateWith { packageName ->
        packageName in blockedPackages && packageName !in leasedPackages
    }
}

class NormalModeEnforcer : EnforcementController {
    override suspend fun reconcile(
        blockedApps: List<BlockedApp>,
        validLeases: List<ActiveLease>,
        protectionState: ProtectionState,
    ) = Unit

    override suspend fun blockPackage(packageName: String) = Unit

    override suspend fun allowPackageTemporarily(packageName: String) = Unit
}

class DeviceOwnerEnforcer(
    private val context: Context,
    private val protectionStateManager: ProtectionStateManager,
) : EnforcementController {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    override suspend fun reconcile(
        blockedApps: List<BlockedApp>,
        validLeases: List<ActiveLease>,
        protectionState: ProtectionState,
    ) {
        if (!DisciplineDeviceAdminReceiver.isDeviceOwner(context)) {
            protectionStateManager.markDegraded(ProtectionFlag.DEVICE_OWNER_MISSING)
            return
        }

        val blockedPackages = blockedApps.asSequence()
            .filter { it.isActive && it.packageName != context.packageName }
            .map { it.packageName }
            .toSet()
        val leasedPackages = validLeases.asSequence()
            .filter { it.type == "app" && !it.isExpired }
            .map { it.identifier }
            .toSet()
        var managedPackages = preferences.getStringSet(MANAGED_PACKAGES, emptySet()).orEmpty().toMutableSet()
        val suspensionPlan = deriveSuspensionPlan(blockedPackages, leasedPackages, managedPackages)
        var reconciliationFailed = false
        for ((packageName, shouldSuspend) in suspensionPlan) {
            val isSuspended = runCatching { context.packageManager.isPackageSuspended(packageName) }.getOrNull()
            if (isSuspended == null) {
                reconciliationFailed = true
                protectionStateManager.markDegraded(ProtectionFlag.ENFORCEMENT_RECONCILIATION_FAILED)
                continue
            }
            if (isSuspended != shouldSuspend && !setSuspended(packageName, shouldSuspend)) {
                reconciliationFailed = true
                protectionStateManager.markDegraded(ProtectionFlag.ENFORCEMENT_RECONCILIATION_FAILED)
                continue
            }
            if (shouldSuspend) managedPackages.add(packageName) else managedPackages.remove(packageName)
        }
        preferences.edit().putStringSet(MANAGED_PACKAGES, managedPackages).apply()
        if (reconciliationFailed) return
        protectionStateManager.clearFlag(ProtectionFlag.ENFORCEMENT_RECONCILIATION_FAILED)
        protectionStateManager.clearFlag(ProtectionFlag.DEVICE_OWNER_MISSING)
        protectionStateManager.markEnforced()
    }

    override suspend fun blockPackage(packageName: String) {
        if (DisciplineDeviceAdminReceiver.isDeviceOwner(context)) setSuspended(packageName, true)
    }

    override suspend fun allowPackageTemporarily(packageName: String) {
        if (DisciplineDeviceAdminReceiver.isDeviceOwner(context)) setSuspended(packageName, false)
    }

    private fun setSuspended(packageName: String, suspended: Boolean): Boolean {
        return DisciplineDeviceAdminReceiver.suspendPackages(context, arrayOf(packageName), suspended)
    }

    private companion object {
        const val PREFERENCES = "disciplineos_enforcement"
        const val MANAGED_PACKAGES = "device_owner_managed_packages"
    }
}

class ModeAwareEnforcer(
    private val context: Context,
    private val normalMode: NormalModeEnforcer,
    private val deviceOwnerMode: DeviceOwnerEnforcer,
    private val protectionStateManager: ProtectionStateManager,
) : EnforcementController {
    private fun delegate(): EnforcementController {
        return if (DisciplineDeviceAdminReceiver.isDeviceOwner(context)) {
            deviceOwnerMode
        } else {
            protectionStateManager.markDegraded(ProtectionFlag.DEVICE_OWNER_MISSING)
            normalMode
        }
    }

    override suspend fun reconcile(
        blockedApps: List<com.disciplineos.domain.model.BlockedApp>,
        validLeases: List<com.disciplineos.domain.model.ActiveLease>,
        protectionState: ProtectionState,
    ) = delegate().reconcile(blockedApps, validLeases, protectionState)

    override suspend fun blockPackage(packageName: String) = delegate().blockPackage(packageName)

    override suspend fun allowPackageTemporarily(packageName: String) = delegate().allowPackageTemporarily(packageName)
}
