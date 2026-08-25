package com.disciplineos.ui.focus

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun FocusTimerScreen(
    durationMinutes: Int = 25,
    onStartSession: suspend () -> Result<String>,
    onHeartbeat: suspend (String) -> Unit,
    onFinishSession: suspend (String) -> Result<Int?>,
    onEmergencyCancel: (String?) -> Unit,
) {
    var totalSecondsRemaining by remember { mutableStateOf(durationMinutes * 60) }
    var isRunning by remember { mutableStateOf(false) }
    var serverSessionId by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var completionRequested by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val result = onStartSession()
        result.fold(
            onSuccess = {
                serverSessionId = it
                isRunning = true
            },
            onFailure = {
                errorMessage = it.message ?: "Could not start server focus session"
            },
        )
    }

    LaunchedEffect(serverSessionId, isRunning) {
        val sessionId = serverSessionId ?: return@LaunchedEffect
        while (isRunning) {
            delay(30_000)
            if (isRunning) onHeartbeat(sessionId)
        }
    }

    LaunchedEffect(isRunning, totalSecondsRemaining, serverSessionId) {
        if (isRunning && totalSecondsRemaining > 0) {
            delay(1000)
            totalSecondsRemaining--
        } else if (isRunning && totalSecondsRemaining == 0 && !completionRequested) {
            val sessionId = serverSessionId ?: return@LaunchedEffect
            completionRequested = true
            isRunning = false
            val result = onFinishSession(sessionId)
            result.onFailure { errorMessage = it.message ?: "Server rejected focus completion" }
        }
    }

    val minutes = totalSecondsRemaining / 60
    val seconds = totalSecondsRemaining % 60
    val formattedTime = "%02d:%02d".format(minutes, seconds)

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFF020617),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Deep Focus Mode",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF8FAFC),
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = errorMessage ?: "The server owns the focus timer and reward.",
                    fontSize = 13.sp,
                    color = if (errorMessage == null) Color(0xFF94A3B8) else Color(0xFFEF4444),
                )
            }

            Box(
                modifier = Modifier.size(240.dp).clip(CircleShape).background(Color(0xFF1E293B)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = formattedTime,
                    fontSize = 48.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF38BDF8),
                )
            }

            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Reward is calculated from server-observed time",
                    color = Color(0xFF22C55E),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
                Spacer(modifier = Modifier.height(24.dp))
                TextButton(
                    onClick = { onEmergencyCancel(serverSessionId) },
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                ) {
                    Text("Emergency Abort (No Points Awarded)", color = Color(0xFFEF4444), fontSize = 13.sp)
                }
            }
        }
    }
}
