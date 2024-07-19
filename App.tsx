import { FlatList, Image, NativeEventEmitter, NativeModules, PermissionsAndroid, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import React, { useEffect, useState } from 'react';
import BleManager from 'react-native-ble-manager';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { HUMIDITY_UUID, TEMPERATURE_UUID } from './BleConstants';
import { colors } from './colors';
import { fonts, fontSize } from './fonts';

interface BluetoothDevice{
    id : string;
    name : string;
    rssi: number;
}

const connectedDevice = () => {
    const [BluetoothDevices,setBluetoothDevices] =useState<BluetoothDevice[]>([]);
    const [isScanning, setIsScanning] = useState<boolean>(false);
    const BleManagerModule = NativeModules.BleManager;
    const BleManagerEmitter = new NativeEventEmitter(BleManagerModule);
    const [currentDevice, setCurrentDevice] = useState<BluetoothDevice | null>(null);


    useEffect(() => {
        BleManager.enableBluetooth().then(() => {
            console.log('Bluetooth is turned on!');
        });
        requestPermission();

        return () => { };
    }, []);

    useEffect(() => {
        BleManager.start({ showAlert: false }).then(() => {
            console.log('BleManager initialized');
        });
    }, []);



    const requestPermission = async () => {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    };

    const startScanning = () => {
        if (!isScanning) {
            BleManager.scan([], 5, true)
                .then(() => {
                    console.log('Scan is started.....');
                    setIsScanning(true);
                })
                .catch(error => {
                    console.error(error);
                });
        }
    };


    useEffect(() => {
        // BLE taramasının durdurulmasını dinleyen olay dinleyicisi
        let stopListener = BleManagerEmitter.addListener(
            'BleManagerStopScan',
            () => {
                setIsScanning(false); // Tarama durdurulduğunda isScanning durumunu false olarak ayarla
                console.log('Scan is stopped'); // Konsola taramanın durduğunu yaz
                handleGetConnectedDevices(); // Tarama durduktan sonra bağlı cihazları al
            },
        );
    
        // BLE cihazının bağlantısının kesilmesini dinleyen olay dinleyicisi
        let disconnected = BleManagerEmitter.addListener(
            'BleManagerDisconnectPeripheral',
            (peripheral) => {
                console.log('Disconnected Device', peripheral); // Bağlantısı kesilen cihazın bilgisini konsola yaz
            },
        );
    
        // BLE karakteristiği güncelleme olayını dinleyen olay dinleyicisi
        let characteristicValueUpdate = BleManagerEmitter.addListener(
            'BleManagerDidUpdateValueForCharacteristic',
            (data) => {
                readCharacteristicFromEvent(data); // Karakteristik değeri güncellendiğinde ilgili fonksiyonu çağır
            },
        );
    
        // BLE durumu güncelleme olayını dinleyen olay dinleyicisi
        let BleManagerDidUpdateState = BleManagerEmitter.addListener(
            'BleManagerDidUpdateState',
            (data) => {
                console.log('BleManagerDidUpdateState Event!', data); // BLE durumu güncellendiğinde konsola yaz
            },
        );
    
        // Temizleme fonksiyonu: bileşen kaldırıldığında olay dinleyicilerini temizle
        return () => {
            stopListener.remove(); // BleManagerStopScan dinleyicisini kaldır
            disconnected.remove(); // BleManagerDisconnectPeripheral dinleyicisini kaldır
            characteristicValueUpdate.remove(); // BleManagerDidUpdateValueForCharacteristic dinleyicisini kaldır
            BleManagerDidUpdateState.remove(); // BleManagerDidUpdateState dinleyicisini kaldır
        };
    }, [BluetoothDevices]); // Bağımlılıklar: bluetoothDevices durumu değiştiğinde kanca yeniden çalıştırılır
    

    const handleGetConnectedDevices = () => {
        BleManager.getDiscoveredPeripherals().then((results: BluetoothDevice[]) => {
            if (results.length == 0) {
                console.log('No connected bluetooth devices');
                startScanning();
            } else {
                const allDevices = results.filter((item) => item.name !== null);
                setBluetoothDevices(allDevices);
            }
        });
    };

    const onConnect = async (item: BluetoothDevice) => {
        console.log("CONNECTED DEVICE:::", item);
        try {
            await BleManager.connect(item.id);
            console.log('Connected');
            setCurrentDevice(item);

            const res = await BleManager.retrieveServices(item.id);
            console.log("RES::::", JSON.stringify(res));
            onServicesDiscovered(res, item);
        } catch (error) {
            console.error(error);
        }
    };

    const onDisconnect = () => {
        if (currentDevice) {
            BleManager.disconnect(currentDevice.id).then(() => {
                setCurrentDevice(null);
            });
        }
    };

    const onServicesDiscovered = (result: any, item: BluetoothDevice) => {
        const services = result?.services;
        const characteristics = result?.characteristics;

        services.forEach((service: any) => {
            const serviceUUID = service.uuid;
            onChangeCharacteristics(serviceUUID, characteristics, item);
        });
    };

    const onChangeCharacteristics = (serviceUUID: any, result: any, item: BluetoothDevice) => {
        result.forEach((characteristic: any) => {
            const characteristicUUID = characteristic.characteristic; // Karakteristiğin UUID'sini al
    
            // Eğer karakteristik UUID'si belirli bir UUID ise (örneğin, cihaz adı UUID'si)
            if (characteristicUUID === "00002a01-0000-1000-8000-00805f9b34fb") {
                readCharacteristic(characteristicUUID, serviceUUID, item); // Bu karakteristiği oku
            }
    
            // Eğer karakteristik UUID'si sıcaklık veya nem karakteristiğine eşitse
            if (characteristicUUID === TEMPERATURE_UUID || characteristicUUID === HUMIDITY_UUID) {
                // Bu karakteristik için bildirim başlat
                BleManager.startNotification(item.id, serviceUUID, characteristicUUID)
                    .then(() => {
                        console.log('Notification started for characteristic:', characteristicUUID); // Başarıyla başlatıldığında konsola yaz
                    })
                    .catch(error => {
                        console.error('Notification error:', error); // Hata oluşursa konsola yaz
                    });
            }
        });
    };
    

    const readCharacteristicFromEvent = (data: any) => {
        const { characteristic, value } = data;

    };

    const readCharacteristic = (characteristicUUID: any, serviceUUID: any, item: BluetoothDevice) => {
        console.log("CURRENT DEVICE ID:::", item?.id);

        BleManager.read(item.id, serviceUUID, characteristicUUID)
            .then(result => {
                if (characteristicUUID === "2a01") {
                    console.log("CHARACTERISTIC " + characteristicUUID, result);
                    extractDeviceName(result);
                }
            })
            .catch(error => {
                console.error('Error during BLE read:', error);
            });
    };


    const extractDeviceName = (valueArray: any) => {
        const deviceName = bytesToString(valueArray);
        console.log("DEVICE NAME:::", deviceName);
    };

    const bytesToString = (bytes: any) => {
        return String.fromCharCode(...bytes);
    };

    const calculateDistance = (rssi: number) => {
        const txPower = -59; // Adjust this value based on your device's TX power
        if (rssi === 0) {
            return -1.0;
        }

        const ratio = rssi * 7.0 / txPower;

        if (ratio < 1.0) {
            return Math.pow(ratio, 10);
        } else {
            const distance = (0.89976) * Math.pow(ratio, 20) + 0.111;
            return distance;
        }
    };

    const renderItem = ({ item }: { item: BluetoothDevice }) => {
        return (
            <View>
                <View style={styles.bleCard}>
                    <Text style={styles.nameTxt}>{item.name}</Text>
                    <TouchableOpacity onPress={() => item.id === currentDevice?.id ? onDisconnect() : onConnect(item)} style={styles.button}>
                        <Text style={styles.btnTxt}>{item.id === currentDevice?.id ? "Disconnect" : "Connect"}</Text>
                    </TouchableOpacity>
                </View>
                <View>
                    <Text>{`Proximity Distance: ${calculateDistance(item.rssi).toFixed(2)}`}</Text>
                </View>
            </View>
        );
    };
    return (
        <View style={{ flex: 1 }}>
            <View style={styles.fullRow}>
                
            </View>
            {isScanning ? (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    
                </View>
            ) : (
                <FlatList
                    data={BluetoothDevices}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                />
            )}
            <TouchableOpacity onPress={() => startScanning()} style={styles.scanBtn}>
                <Text style={styles.btnTxt}>Start Scan</Text>
            </TouchableOpacity>
        </View>
    );
};



export default connectedDevice;
const styles = StyleSheet.create({
    bleCard: {
        width: "90%",
        padding: 10,
        alignSelf: "center",
        marginVertical: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: colors.secondary,
        elevation: 5,
        borderRadius: 5
    },
    nameTxt: {
        fontFamily: fonts.bold,
        fontSize: fontSize.font18,
        color: colors.text
    },
    button: {
        width: 100,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.primary,
        borderRadius: 5
    },
    btnTxt: {
        fontFamily: fonts.bold,
        fontSize: fontSize.font18,
        color: colors.white
    },
    label: {
        fontSize: 20,
        textAlign: 'center',
        color: colors.text,
        fontFamily: fonts.bold,
    },
    icon: {
        width: 60,
        height: 60,
        resizeMode: "contain",
        marginVertical: hp(2)
    },
    tempCard: {
        width: wp(45),
        backgroundColor: colors.secondary,
        elevation: 2,
        paddingVertical: hp(1.5),
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center"
    },
    fullRow: {
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-around",
        marginTop: hp(2)
    },
    scanBtn: {
        width: "90%",
        height: 50,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.primary,
        borderRadius: 5,
        alignSelf: "center",
        marginBottom: hp(2)
    }
});
