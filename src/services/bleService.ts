export interface BLEConnection {
  token: string;
  writeToken: (newToken: string, durationMinutes: number) => Promise<void>;
  disconnect: () => void;
}

export const connectToESP32 = async (): Promise<BLEConnection> => {
  if (!(navigator as any).bluetooth) {
    throw new Error('Web Bluetooth API is not supported in this browser. Please use Chrome on a supported OS.');
  }

  try {
    const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
    const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

    console.log('Requesting Bluetooth Device...');
    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ namePrefix: 'Hostel_Floor' }],
      optionalServices: [SERVICE_UUID]
    });

    console.log('Connecting to GATT Server...');
    const server = await device.gatt?.connect();
    
    if (!server) throw new Error('Could not connect to GATT Server.');

    console.log('Getting Service...');
    const service = await server.getPrimaryService(SERVICE_UUID);

    console.log('Getting Characteristic...');
    const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    console.log('Reading Value...');
    const value = await characteristic.readValue();
    const token = new TextDecoder().decode(value).replace(/\0/g, '').trim();

    const writeToken = async (newToken: string, durationMinutes: number) => {
      const writeCommand = `SET:${newToken}:${durationMinutes}`;
      console.log('Writing to ESP32:', writeCommand);
      const encoder = new TextEncoder();
      await characteristic.writeValue(encoder.encode(writeCommand));
    };

    const disconnect = () => {
      if (device.gatt?.connected) {
        console.log('Disconnecting from ESP32...');
        device.gatt.disconnect();
      }
    };

    return { token, writeToken, disconnect };
  } catch (error: any) {
    console.error('BLE Error:', error);
    throw new Error(error.message || 'Failed to connect via Bluetooth.');
  }
};
