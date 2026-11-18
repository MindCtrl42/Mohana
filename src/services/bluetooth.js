// Web Bluetooth Connection Service for MotoHapticNav (Mohana)
export const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const TARGET_DEVICE_NAME = "MotoHapticNav";

// Note: A 128-bit UUID must strictly have 32 hex chars (36 with hyphens).
// 'beb5483e-36e1-4688-b7f5-ea07361b26ae' is the standard 12-char tail.
export const CHAR_UUID_PRIMARY = "beb5483e-36e1-4688-b7f5-ea07361b26ae";
export const CHAR_UUID_SECONDARY = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

class BluetoothService {
  constructor() {
    this.device = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onStateChange = null;
    this.onLog = null;
  }

  log(msg, type = 'info') {
    if (this.onLog) this.onLog(msg, type);
    console.log(`[BLE] ${msg}`);
  }

  async connect(onDisconnectCallback) {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth is not supported on this browser. On iOS, please use the Bluefy browser.");
    }

    this.log(`Requesting device '${TARGET_DEVICE_NAME}'...`);

    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: TARGET_DEVICE_NAME },
        { namePrefix: 'Moto' }
      ],
      optionalServices: [SERVICE_UUID]
    });

    this.device.addEventListener('gattserverdisconnected', () => {
      this.isConnected = false;
      this.characteristic = null;
      this.log("Device disconnected", "err");
      if (onDisconnectCallback) onDisconnectCallback();
    });

    this.log("Connecting to GATT Server...");
    const server = await this.device.gatt.connect();

    this.log("Retrieving Navigation Primary Service...");
    const service = await server.getPrimaryService(SERVICE_UUID);

    // Resilient characteristic discovery (resolves 26ae, 26a9, or dynamically finds first writable)
    this.log("Discovering characteristics...");
    const characteristics = await service.getCharacteristics();
    
    this.characteristic = characteristics.find(c => 
      c.uuid.includes("26ae") || c.uuid.includes("26a9")
    ) || characteristics[0];

    if (!this.characteristic) {
      throw new Error("No compatible characteristic found in service.");
    }

    this.isConnected = true;
    this.log(`Linked to characteristic (${this.characteristic.uuid})`, "ok");
    return this.device.name || TARGET_DEVICE_NAME;
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this.characteristic = null;
  }

  async sendCommand(cmd) {
    if (!this.characteristic) {
      this.log(`[MOCK TX] '${cmd}' (Not connected)`, "warn");
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(cmd);
      if (this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(payload);
      } else {
        await this.characteristic.writeValue(payload);
      }
      this.log(`[TX SENT] '${cmd}' to ESP32`, "cue");
      return true;
    } catch (err) {
      this.log(`Transmission error: ${err.message}`, "err");
      return false;
    }
  }
}

export const bleService = new BluetoothService();
