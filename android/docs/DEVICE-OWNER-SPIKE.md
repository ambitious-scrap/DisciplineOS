# Android Device Owner Spike & Evaluation

**Status:** Technical Spike & Risk Assessment for Future Hard Lockdown Mode  
**Related Spec:** [`FINAL-PRODUCT-SPEC.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/FINAL-PRODUCT-SPEC.md)

---

## 1. Critical User Notice

> [!CAUTION]
> **Factory Reset Requirement:** On personal Android consumer devices, setting a Device Owner app via ADB requires removing all Google accounts from the device or provisioning immediately after a clean factory reset. DisciplineOS Normal Mode does **not** require a factory reset.

---

## 2. Capabilities in Device Owner Mode

When provisioned as Device Owner (`com.disciplineos/.receiver.DisciplineDeviceAdminReceiver`):

1. **Direct Package Suspension (`setPackagesSuspended`):**
   - The OS greys out the app icon on the home screen and launcher.
   - Tapping the icon displays a system dialog stating the app is suspended by DisciplineOS.
   - Zero background battery drain or polling required.
2. **Uninstall Protection (`DISALLOW_UNINSTALL_APPS`):**
   - Prevents the user from uninstalling DisciplineOS or blocked distractor applications.
3. **Safe Mode Enforcement:**
   - Safe Mode rebooting is prevented or the policy automatically re-applies upon normal boot.
4. **Permanent VPN Lockdown (`setAlwaysOnVpnPackage`):**
   - Prevents the user from turning off or bypassing the DisciplineOS DNS VPN.

---

## 3. Provisioning & Deprovisioning Commands

### Provisioning (via ADB):
```bash
# Verify device connected
adb devices

# Set DisciplineOS as Device Owner
adb shell dpm set-device-owner com.disciplineos/.receiver.DisciplineDeviceAdminReceiver
```

### Safe Deprovisioning & Removal:
```bash
# Remove Device Owner privileges safely
adb shell dpm remove-active-admin com.disciplineos/.receiver.DisciplineDeviceAdminReceiver
```
