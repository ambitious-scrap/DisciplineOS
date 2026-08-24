package com.disciplineos.ui.overlay

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.disciplineos.DisciplineApplication
import kotlinx.coroutines.launch

class BlockOverlayActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val identifier = intent.getStringExtra(EXTRA_BLOCKED_IDENTIFIER) ?: "Distraction"
        val type = intent.getStringExtra(EXTRA_BLOCKED_TYPE) ?: "app"

        setContent {
            BlockOverlayScreen(
                identifier = identifier,
                type = type,
                onGoHome = { returnToHomeScreen() },
                onUnlock = { seconds ->
                    unlockApp(identifier, type, seconds, isEmergency = false)
                },
                onEmergencyUnlock = { seconds ->
                    unlockApp(identifier, type, seconds, isEmergency = true)
                }
            )
        }
    }

    private fun returnToHomeScreen() {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(homeIntent)
        finish()
    }

    private fun unlockApp(identifier: String, type: String, seconds: Int, isEmergency: Boolean) {
        val app = application as DisciplineApplication
        lifecycleScope.launch {
            val result = if (isEmergency) {
                app.emergencyUnlockUseCase(identifier, type, seconds)
            } else {
                app.spendUnlockUseCase(identifier, type, seconds)
            }

            if (result.isSuccess) {
                finish() // Dismiss overlay and allow user through
            }
        }
    }

    override fun onBackPressed() {
        returnToHomeScreen()
    }

    companion object {
        const val EXTRA_BLOCKED_IDENTIFIER = "extra_identifier"
        const val EXTRA_BLOCKED_TYPE = "extra_type"
    }
}

@Composable
fun BlockOverlayScreen(
    identifier: String,
    type: String,
    onGoHome: () -> Unit,
    onUnlock: (Int) -> Unit,
    onEmergencyUnlock: (Int) -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "🛡️ Focus Shield Active",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "$identifier is locked under your discipline policy.",
                fontSize = 15.sp,
                color = Color(0xFF94A3B8),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = onGoHome,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text("Return to Focus (Home)", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { onUnlock(300) }, // 5 min
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text("Unlock 5 mins (5 min points)", color = Color(0xFF38BDF8), fontSize = 15.sp)
            }

            Spacer(modifier = Modifier.height(12.dp))

            TextButton(
                onClick = { onEmergencyUnlock(300) }
            ) {
                Text("Emergency Unlock (3x Cost Penalty)", color = Color(0xFFEF4444), fontSize = 13.sp)
            }
        }
    }
}
