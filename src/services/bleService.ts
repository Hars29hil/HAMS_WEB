export const connectToESP32 = async (): Promise<string> => {
  if (!(navigator as any).bluetooth) {
    throw new Error('Web Bluetooth API is not supported in this browser. Please use Chrome on a supported OS.');
  }

  try {
    const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
    const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

    console.log('Requesting Bluetooth Device...');
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true
    });

    console.log('Device selected:', device.name || 'Unknown Device');
    
    // Proximity verified by user selection. Do not connect to GATT.
    return 'NONE';
  } catch (error: any) {
    console.error('BLE Error:', error);
    throw new Error(error.message || 'Failed to connect via Bluetooth.');
  }
};
