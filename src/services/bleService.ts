export const connectToESP32 = async (): Promise<string> => {
  if (!(navigator as any).bluetooth) {
    throw new Error('Web Bluetooth API is not supported in this browser. Please use Chrome on a supported OS.');
  }

  try {
    console.log('Requesting Bluetooth Device...');
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true
    });

    console.log('Device selected:', device.name || 'Unknown Device');
    
    // We do not connect to GATT. We just verified proximity by having the user select the device.
    // Return NONE so the frontend triggers the fallback token request to the backend.
    return 'NONE';
  } catch (error: any) {
    console.error('BLE Error:', error);
    throw new Error(error.message || 'Failed to scan for Bluetooth device.');
  }
};
