import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, PermissionsAndroid, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules } from 'react-native';

// Peripheral türünü tanımlayın
interface Peripheral {
  id: string;
  name?: string;
}

const App = () => {
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Peripheral | null>(null);

  useEffect(() => {
    BleManager.start({ showAlert: false });

    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN).then((result) => {
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("SCAN PERMISSION DENIED");
        }
      });
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).then((result) => {
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location permission denied");
        }
      });
    }
  }, []);

  const startScan = () => {
    if (!scanning) {
      setDevices([]);
      setScanning(true);
      BleManager.scan([], 20, true).then(() => {
        console.log('Scanning...');
      });
    }
  };

  const connectToDevice = (device: Peripheral) => {
    BleManager.connect(device.id)
      .then(() => {
        console.log('Connected to', device.id);
        setConnectedDevice(device);
      })
      .catch((error) => {
        console.log('Connection error', error);
      });
  };

  useEffect(() => {
    const handleDiscoverPeripheral = (peripheral: Peripheral) => {
      console.log('Discovered:', peripheral);
      setDevices((prevDevices) => {
        if (!prevDevices.some(device => device.id === peripheral.id)) {
          if (peripheral.name === 'JDY-23' || peripheral.id === '12:6C:14:38:F5:40') {
            connectToDevice(peripheral);
          }
          return [...prevDevices, peripheral];
        }
        return prevDevices;
      });
    };

    const handleStopScan = () => {
      console.log('Scan stopped');
      setScanning(false);
    };

    const bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager);

    const discoverPeripheralListener = bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      handleDiscoverPeripheral
    );
    const stopScanListener = bleManagerEmitter.addListener(
      'BleManagerStopScan',
      handleStopScan
    );

    return () => {
      discoverPeripheralListener.remove();
      stopScanListener.remove();
    };
  }, []);

  return (
    <View>
      <Button title="Start Scan" onPress={startScan} disabled={scanning} />
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.name || 'Unnamed device'}</Text>
            <Text>{item.id}</Text>
          </View>
        )}
      />
      {connectedDevice && (
        <View>
          <Text>Connected to {connectedDevice.name} - {connectedDevice.id}</Text>
        </View>
      )}
    </View>
  );
};

export default App;
