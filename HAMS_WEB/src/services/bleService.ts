export interface BLEConnection {
  token: string;
  writeToken: (newToken: string, durationMinutes: number) => Promise<void>;
  disconnect: () => void;
}

export const connectToESP32 = async (): Promise<BLEConnection> => {
  if (!(navigator as any).bluetooth) {
    throw new Error("Web Bluetooth API is not supported in this browser. Please use Chrome on a supported OS.<br/><br/>If you are using the IOS DEVICE than dolwoand <a href='https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055' target='_blank' style='color: #4da6ff; text-decoration: underline;'>BLUEFY</a> browser from AppStore.");
  }

  try {
    const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
    const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

    console.log('Requesting Bluetooth Device...');
    let device;
    try {
      device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Hostel_Floor' },
          { namePrefix: 'ESP32' },
          { services: [SERVICE_UUID] }
        ],
        optionalServices: [SERVICE_UUID]
      });
    } catch (filterErr: any) {
      // If user cancelled, rethrow
      if (filterErr.name === 'NotFoundError' && filterErr.message.includes('User cancelled')) {
        throw filterErr;
      }
      // Otherwise fallback to acceptAllDevices
      device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
      });
    }

    console.log('Connecting to device...');
    let token = 'BEACON_ONLY';
    let writeToken = async (_newToken: string, _durationMinutes: number) => {};
    
    try {
      if (device.gatt) {
        console.log('Connecting to GATT Server...');
        const server = await device.gatt.connect();
        if (server) {
          console.log('Getting Service...');
          const service = await server.getPrimaryService(SERVICE_UUID);
          console.log('Getting Characteristic...');
          const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
          console.log('Reading Value...');
          const value = await characteristic.readValue();
          token = new TextDecoder().decode(value).replace(/\0/g, '').trim() || 'BEACON_ONLY';
          
          writeToken = async (newToken: string, durationMinutes: number) => {
            const writeCommand = `SET:${newToken}:${durationMinutes}`;
            console.log('Writing to ESP32:', writeCommand);
            const encoder = new TextEncoder();
            await characteristic.writeValue(encoder.encode(writeCommand));
          };
        }
      }
    } catch (gattErr: any) {
      console.log('Beacon-only mode detected (No GATT service hosted):', gattErr.message);
      token = 'BEACON_ONLY';
    } finally {
      if (device.gatt?.connected) {
        console.log('Disconnecting from ESP32 immediately...');
        device.gatt.disconnect();
      }
    }

    const disconnect = () => {
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    };

    return { token, writeToken, disconnect };
  } catch (error: any) {
    console.error('BLE Error:', error);
    throw new Error(error.message || 'Failed to detect Bluetooth beacon.');
  }
};
