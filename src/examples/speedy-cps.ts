#!/usr/bin/env node

import SerialPort from 'serialport'
import prompt from 'prompt';
import { HalfDuplexPackets } from '../HalfDuplexPackets'
import { Speeduino } from '../Speeduino'

async function logCPS(port: SerialPort.PortInfo, interval: number) {
    // Setup the required connections
    const sp = new SerialPort(port.path, { baudRate: 115200, autoOpen: false })
    sp.on('error', () => console.log("Serial port error"))
    const conn = new HalfDuplexPackets(sp)
    conn.on('unexpected', (data) => { console.log("Unexpected data:", data); throw "ERROR" })
    const speedy = new Speeduino(conn)

    // Make sure we can connect
    try {
        await new Promise<void>((resolve, reject) => sp.open((err) => err ? reject(err) : resolve()))
    } catch (err) {
        console.log("Couldn't connect:", err)
        return
    }

    // Display the signatures
    try {
        await speedy.signature().then((response) => {
                console.log("Signature:", response)})
        await speedy.versionInfo().then((response) => {
                console.log("Version info:", response)})  
    } catch (err) {
        console.log("Error on info:", err.message)
        sp.close()
        return        
    }

    while (true) {
        const everyOneSecond = new Promise<void>(resolve => setTimeout(resolve, interval))
        try {
            const response = await speedy.raw.outputChannels(121)
            console.log((new Date).toISOString(), "Cycles per second:", (response[26] << 8) + response[25])
        } catch (err) {
            console.log("Error on outputChannels:", err.message)
            sp.close()
            return
        }
        await everyOneSecond
    }
}

SerialPort.list().then(async (ports) => {
    for (let idx in ports) {
        const port = ports[idx]
        console.log(`[${idx}]: ${port.path}`)
    }
    const choice = await prompt.get(['id'])
    const port = ports[parseInt(choice['id'] as string)]

    const continuallLogCPS = async (interval: number) => {
        while (true) {
            await logCPS(port, interval)
            await new Promise<void>(resolve => setTimeout(resolve, interval))
        }
    }
    continuallLogCPS(1000)
})