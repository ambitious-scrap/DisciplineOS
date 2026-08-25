package com.disciplineos.ui

import android.app.Activity
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.disciplineos.DisciplineApplication
import com.disciplineos.data.local.entity.BlockedAppEntity
import com.disciplineos.data.local.entity.BlockedSiteEntity
import com.disciplineos.domain.model.BlockedApp
import com.disciplineos.domain.model.BlockedSite
import com.disciplineos.domain.model.TaskItem
import com.disciplineos.evidence.LivePhotoCaptureActivity
import com.disciplineos.service.DisciplineForegroundService
import com.disciplineos.ui.focus.FocusTimerScreen
import com.disciplineos.ui.overlay.BlockOverlayActivity
import com.disciplineos.vpn.DisciplineVpnService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private val vpnActiveState = mutableStateOf(false)
    private val usageStatsPermissionState = mutableStateOf(false)
    private val overlayPermissionState = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        refreshPermissions()

        setContent {
            val context = LocalContext.current
            var selectedTab by remember { mutableStateOf(0) }
            val hasUsagePermission by usageStatsPermissionState
            val hasOverlayPermission by overlayPermissionState
            val isVpnActive by vpnActiveState

            // Live app & site list from Room DB
            val app = application as DisciplineApplication
            var isPaired by remember { mutableStateOf(app.hasDeviceCredentials) }
            val tasks by app.taskRepository.getTasksFlow().collectAsState(initial = emptyList())
            var focusTaskId by remember { mutableStateOf<String?>(null) }
            var blockedApps by remember { mutableStateOf<List<BlockedAppEntity>>(emptyList()) }
            var blockedSites by remember { mutableStateOf<List<BlockedSiteEntity>>(emptyList()) }
            LaunchedEffect(Unit) {
                withContext(Dispatchers.IO) {
                    app.policyRepository.syncPolicy()
                    blockedApps = app.database.policyDao().getBlockedApps()
                    blockedSites = app.database.policyDao().getBlockedSites()
                }
            }
            LaunchedEffect(isPaired) {
                if (isPaired) app.taskRepository.syncTasks()
            }

            // VPN Permission Launcher
            val vpnLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.StartActivityForResult()
            ) { result ->
                if (result.resultCode == Activity.RESULT_OK) {
                    startDisciplineVpn()
                } else {

                    Toast.makeText(context, "VPN permission was not granted.", Toast.LENGTH_SHORT).show()
                }
            }

            val photoCaptureLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.StartActivityForResult()
            ) { result ->
                val data = result.data
                val taskId = data?.getStringExtra(LivePhotoCaptureActivity.EXTRA_TASK_ID)
                val sha256 = data?.getStringExtra(LivePhotoCaptureActivity.EXTRA_EVIDENCE_HASH)
                if (result.resultCode == Activity.RESULT_OK && taskId != null && sha256 != null) {
                    lifecycleScope.launch {
                        val occurrenceDate = LocalDate.now().toString()
                        val completeResult = app.taskRepository.submitPhotoEvidence(taskId, occurrenceDate, sha256)
                            .fold(
                                onSuccess = { evidenceId ->
                                    app.taskRepository.completeTask(
                                        taskId = taskId,
                                        occurrenceDate = occurrenceDate,
                                        photoEvidenceId = evidenceId,
                                    )
                                },
                                onFailure = { Result.failure(it) },
                            )
                        completeResult
                            .onSuccess { balance ->
                                Toast.makeText(
                                    this@MainActivity,
                                    "Photo task complete. Balance: ${balance.balanceSeconds / 60} mins.",
                                    Toast.LENGTH_LONG,
                                ).show()
                                app.taskRepository.syncTasks()
                            }
                            .onFailure {
                                Toast.makeText(
                                    this@MainActivity,
                                    it.message ?: "Photo task completion failed.",
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                    }
                }
            }

            if (!isPaired) {
                PairDeviceScreen(
                    onPair = { email, password ->
                        app.authenticateAndPair(email, password, "DisciplineOS Android").also { result ->
                            if (result.isSuccess) {
                                app.policyRepository.syncPolicy()
                                isPaired = true
                            }
                        }
                    }
                )
            } else {
                Scaffold(
                bottomBar = {
                    NavigationBar(
                        containerColor = Color(0xFF0F172A),
                        contentColor = Color(0xFF94A3B8)
                    ) {
                        NavigationBarItem(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            icon = { Text("🛡️", fontSize = 18.sp) },
                            label = { Text("Shields", fontSize = 11.sp) }
                        )
                        NavigationBarItem(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            icon = { Text("🚫", fontSize = 18.sp) },
                            label = { Text("Blocklist", fontSize = 11.sp) }
                        )
                        NavigationBarItem(
                            selected = selectedTab == 2,
                            onClick = { selectedTab = 2 },
                            icon = { Text("🎯", fontSize = 18.sp) },
                            label = { Text("Focus", fontSize = 11.sp) }
                        )
                        NavigationBarItem(
                            selected = selectedTab == 3,
                            onClick = { selectedTab = 3 },
                            icon = { Text("📋", fontSize = 18.sp) },
                            label = { Text("Tasks", fontSize = 11.sp) }
                        )
                    }
                }
            ) { padding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF020617))
                        .padding(padding)
                ) {
                    when (selectedTab) {
                        0 -> ShieldsDashboardScreen(
                            hasUsagePermission = hasUsagePermission,
                            hasOverlayPermission = hasOverlayPermission,
                            isVpnActive = isVpnActive,
                            onGrantUsage = {
                                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                            },
                            onGrantOverlay = {
                                val intent = Intent(
                                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:$packageName")
                                )
                                startActivity(intent)
                            },
                            onToggleVpn = {
                                val vpnIntent = VpnService.prepare(this@MainActivity)
                                if (vpnIntent != null) {
                                    vpnLauncher.launch(vpnIntent)
                                } else {
                                    startDisciplineVpn()
                                }
                            },
                            onOpenAccessibility = {
                                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                            },
                            onTestBlockShield = {
                                val intent = Intent(this@MainActivity, BlockOverlayActivity::class.java).apply {
                                    putExtra(BlockOverlayActivity.EXTRA_BLOCKED_IDENTIFIER, "com.instagram.android")
                                    putExtra(BlockOverlayActivity.EXTRA_BLOCKED_TYPE, "app")
                                }
                                startActivity(intent)
                            }
                        )

                        1 -> BlocklistScreen(
                            blockedApps = blockedApps,
                            blockedSites = blockedSites,
                            onAddApp = { pkg, name ->
                                lifecycleScope.launch {
                                    val result = withContext(Dispatchers.IO) {
                                        app.policyRepository.addApp(pkg, name)
                                    }
                                    if (result.isSuccess) {
                                        app.policyRepository.syncPolicy()
                                        blockedApps = app.database.policyDao().getBlockedApps()
                                    }
                                }
                            },
                            onDeleteApp = { id ->
                                lifecycleScope.launch(Dispatchers.IO) {
                                    val result = app.policyRepository.requestRemoveApp(id)
                                    if (result.isSuccess) {
                                        app.policyRepository.syncPolicy()
                                        blockedApps = app.database.policyDao().getBlockedApps()
                                    }
                                }
                            },
                            onAddSite = { domain ->
                                lifecycleScope.launch {
                                    val result = withContext(Dispatchers.IO) {
                                        app.policyRepository.addSite(domain)
                                    }
                                    if (result.isSuccess) {
                                        app.policyRepository.syncPolicy()
                                        blockedSites = app.database.policyDao().getBlockedSites()
                                    }
                                }
                            },
                            onDeleteSite = { id ->
                                lifecycleScope.launch(Dispatchers.IO) {
                                    val result = app.policyRepository.requestRemoveSite(id)
                                    if (result.isSuccess) {
                                        app.policyRepository.syncPolicy()
                                        blockedSites = app.database.policyDao().getBlockedSites()
                                    }
                                }
                            }
                        )

                        2 -> FocusTimerScreen(
                            durationMinutes = 25,
                            onStartSession = {
                                app.focusRepository.start(
                                    plannedDurationSeconds = 25 * 60,
                                    associatedTaskId = focusTaskId,
                                ).map { it.id }
                            },
                            onHeartbeat = { sessionId ->
                                app.focusRepository.heartbeat(sessionId)
                            },
                            onFinishSession = { sessionId ->
                                app.focusRepository.complete(sessionId).mapCatching { result ->
                                    val taskId = focusTaskId
                                    if (taskId != null) {
                                        app.taskRepository.completeTask(
                                            taskId = taskId,
                                            occurrenceDate = LocalDate.now().toString(),
                                            evidenceSessionId = sessionId,
                                        ).getOrThrow()
                                    }
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Focus session complete. Server reward: ${result.rewardSeconds / 60} mins.",
                                        Toast.LENGTH_LONG,
                                    ).show()
                                    selectedTab = 0
                                    focusTaskId = null
                                    result.rewardSeconds
                                }
                            },
                            onEmergencyCancel = { sessionId ->
                                lifecycleScope.launch {
                                    if (sessionId != null) app.focusRepository.abandon(sessionId)
                                    Toast.makeText(this@MainActivity, "Focus session aborted.", Toast.LENGTH_SHORT).show()
                                    selectedTab = 0
                                    focusTaskId = null
                                }
                            },
                        )

                        3 -> TasksTabScreen(
                            tasks = tasks,
                            onStartPhotoCapture = { task ->
                                val intent = Intent(this@MainActivity, LivePhotoCaptureActivity::class.java).apply {
                                    putExtra(LivePhotoCaptureActivity.EXTRA_TASK_ID, task.id)
                                }
                                photoCaptureLauncher.launch(intent)
                            },
                            onStartFocus = { task ->
                                focusTaskId = task.id
                                selectedTab = 2
                            },
                            onCompleteTask = { task ->
                                lifecycleScope.launch {
                                    app.taskRepository.completeTask(task.id, LocalDate.now().toString())
                                        .onSuccess { balance ->
                                            Toast.makeText(
                                                this@MainActivity,
                                                "Task complete. Balance: ${balance.balanceSeconds / 60} mins.",
                                                Toast.LENGTH_LONG,
                                            ).show()
                                            app.taskRepository.syncTasks()
                                        }
                                        .onFailure {
                                            Toast.makeText(
                                                this@MainActivity,
                                                it.message ?: "Task completion failed.",
                                                Toast.LENGTH_LONG,
                                            ).show()
                                        }
                                }
                            },
                        )
                    }
                }
            }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshPermissions()
        // Ensure background enforcer service is active
        if (usageStatsPermissionState.value) {
            DisciplineForegroundService.start(this)
        }
    }

    private fun refreshPermissions() {
        usageStatsPermissionState.value = checkUsageStatsPermission()
        overlayPermissionState.value = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(this)
        } else {
            true
        }
    }

    private fun startDisciplineVpn() {
        val intent = Intent(this, DisciplineVpnService::class.java)
        startService(intent)
        vpnActiveState.value = true
        Toast.makeText(this, "🛡️ Website DNS Shield Activated", Toast.LENGTH_SHORT).show()
    }

    private fun checkUsageStatsPermission(): Boolean {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                packageName
            )
        } else {
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }
}

@Composable
private fun PairDeviceScreen(
    onPair: suspend (email: String, password: String) -> Result<Unit>
) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var pairing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFF020617)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Pair this device",
                color = Color.White,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "DisciplineOS requires a server-issued device credential before enforcement can start.",
                color = Color(0xFF94A3B8),
                fontSize = 14.sp
            )
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Account email") },
                singleLine = true,
                enabled = !pairing
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Account password") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                enabled = !pairing
            )
            errorMessage?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = Color(0xFFFCA5A5), fontSize = 13.sp)
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    scope.launch {
                        pairing = true
                        errorMessage = null
                        val result = onPair(email.trim(), password)
                        pairing = false
                        errorMessage = result.exceptionOrNull()?.message
                    }
                },
                enabled = !pairing && email.isNotBlank() && password.isNotBlank()
            ) {
                if (pairing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Pair securely")
                }
            }
        }
    }
}

@Composable
fun ShieldsDashboardScreen(
    hasUsagePermission: Boolean,
    hasOverlayPermission: Boolean,
    isVpnActive: Boolean,
    onGrantUsage: () -> Unit,
    onGrantOverlay: () -> Unit,
    onToggleVpn: () -> Unit,
    onOpenAccessibility: () -> Unit,
    onTestBlockShield: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "DisciplineOS",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
            Text(
                text = "Cross-Device Focus & Distraction Engine",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8)
            )
        }

        // Time Bank Balance Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Available Distraction Bank",
                        fontSize = 13.sp,
                        color = Color(0xFF94A3B8)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "60 mins",
                        fontSize = 34.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF38BDF8)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Spend points to temporarily unlock distracting apps/sites. Earn points via tasks.",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }
            }
        }

        item {
            Text(
                text = "Enforcement Shields",
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFFF8FAFC)
            )
        }

        // 1. App Usage Access Shield
        item {
            PermissionCard(
                title = "1. App Usage Interceptor",
                description = "Monitors and detects distracting apps in the foreground.",
                isGranted = hasUsagePermission,
                buttonText = "Grant Usage Access",
                onAction = onGrantUsage
            )
        }

        // 2. Overlay Permission Shield
        item {
            PermissionCard(
                title = "2. Display Over Other Apps",
                description = "Allows the focus shield to lock and overlay blocked apps instantly.",
                isGranted = hasOverlayPermission,
                buttonText = "Grant Overlay",
                onAction = onGrantOverlay
            )
        }

        // 3. DNS VPN Website Filter Shield
        item {
            PermissionCard(
                title = "3. Website DNS Shield (VPN)",
                description = "Intercepts and blocks distracting websites across all browsers.",
                isGranted = isVpnActive,
                buttonText = if (isVpnActive) "Active" else "Enable DNS Shield",
                onAction = onToggleVpn
            )
        }

        // 4. Accessibility Service Shield
        item {
            PermissionCard(
                title = "4. Accessibility Instant Blocker",
                description = "Zero-latency window interceptor fallback.",
                isGranted = false,
                buttonText = "Enable Accessibility",
                onAction = onOpenAccessibility
            )
        }

        // Test Lock Screen
        item {
            Button(
                onClick = onTestBlockShield,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Text("🧪 Test Block Shield Overlay", color = Color(0xFFF8FAFC), fontSize = 14.sp)
            }
        }
    }
}

@Composable
fun PermissionCard(
    title: String,
    description: String,
    isGranted: Boolean,
    buttonText: String,
    onAction: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                Text(
                    text = title,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFFF8FAFC),
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = description,
                    fontSize = 12.sp,
                    color = Color(0xFF94A3B8)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (isGranted) "● Active & Enforced" else "○ Permission Needed",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (isGranted) Color(0xFF22C55E) else Color(0xFFF59E0B)
                )
            }

            if (!isGranted) {
                Button(
                    onClick = onAction,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(buttonText, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
fun BlocklistScreen(
    blockedApps: List<BlockedAppEntity>,
    blockedSites: List<BlockedSiteEntity>,
    onAddApp: (String, String) -> Unit,
    onDeleteApp: (String) -> Unit,
    onAddSite: (String) -> Unit,
    onDeleteSite: (String) -> Unit
) {
    var newPkgName by remember { mutableStateOf("") }
    var newAppName by remember { mutableStateOf("") }
    var newSiteDomain by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "Blocked Applications (${blockedApps.size})",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
            Text(
                text = "These apps will immediately show the Focus Shield when opened.",
                fontSize = 12.sp,
                color = Color(0xFF94A3B8)
            )
        }

        items(blockedApps) { app ->
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(app.displayName, fontWeight = FontWeight.SemiBold, color = Color(0xFFF8FAFC))
                        Text(app.packageName, fontSize = 12.sp, color = Color(0xFF64748B))
                    }
                    Text(
                        text = "Remove",
                        color = Color(0xFFEF4444),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.clickable { onDeleteApp(app.id) }
                    )
                }
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Add Custom App to Block", color = Color(0xFF94A3B8), fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = newAppName,
                        onValueChange = { newAppName = it },
                        label = { Text("App Name (e.g. Reddit)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = newPkgName,
                        onValueChange = { newPkgName = it },
                        label = { Text("Package (e.g. com.reddit.frontpage)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            if (newPkgName.isNotBlank()) {
                                onAddApp(newPkgName.trim(), if (newAppName.isBlank()) newPkgName.trim() else newAppName.trim())
                                newPkgName = ""
                                newAppName = ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("+ Block App")
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Blocked Domains (${blockedSites.size})",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
        }

        items(blockedSites) { site ->
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(site.domain, fontWeight = FontWeight.SemiBold, color = Color(0xFFF8FAFC))
                    Text(
                        text = "Remove",
                        color = Color(0xFFEF4444),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.clickable { onDeleteSite(site.id) }
                    )
                }
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Add Custom Domain to Block", color = Color(0xFF94A3B8), fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = newSiteDomain,
                        onValueChange = { newSiteDomain = it },
                        label = { Text("Domain (e.g. reddit.com)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            if (newSiteDomain.isNotBlank()) {
                                onAddSite(newSiteDomain.trim().lowercase())
                                newSiteDomain = ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("+ Block Domain")
                    }
                }
            }
        }
    }
}

@Composable
fun TasksTabScreen(
    tasks: List<TaskItem>,
    onStartPhotoCapture: (TaskItem) -> Unit,
    onStartFocus: (TaskItem) -> Unit,
    onCompleteTask: (TaskItem) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text(
                text = "Productivity Tasks & Rewards",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC),
            )
            Text(
                text = "Complete real-world habits to earn focus points in your Time Bank.",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
            )
        }

        if (tasks.isEmpty()) {
            item {
                Text(
                    text = "No server tasks available.",
                    color = Color(0xFF64748B),
                    modifier = Modifier.padding(top = 24.dp),
                )
            }
        }

        items(tasks) { task ->
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(task.title, fontWeight = FontWeight.Bold, color = Color(0xFFF8FAFC), fontSize = 16.sp)
                    if (!task.description.isNullOrEmpty()) {
                        Text(task.description, color = Color(0xFF94A3B8), fontSize = 13.sp)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "+${task.rewardSeconds / 60} mins",
                            color = Color(0xFF22C55E),
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )

                        Button(
                            onClick = {
                                when (task.evidenceType) {
                                    "photo" -> onStartPhotoCapture(task)
                                    "focus_timer" -> onStartFocus(task)
                                    else -> onCompleteTask(task)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                        ) {
                            Text(
                                when (task.evidenceType) {
                                    "photo" -> "Verify Proof"
                                    "focus_timer" -> "Start Focus"
                                    else -> "Claim Reward"
                                },
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}
