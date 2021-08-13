import SerialPort from 'serialport'

console.log("Initial run");
SerialPort.list().then((ports) => {
    for (let idx in ports) {
        const port = ports[idx]
        console.log(`[${idx}]: ${port.path}`)
    }
})
