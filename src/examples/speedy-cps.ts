#!/usr/bin/env node

import SerialPort from 'serialport'
import prompt from 'prompt';
import { Speeduino } from '../Speeduino'

async function logLPS(portPath: string, interval: number) {
    // Setup the required connections
    const speedy = new Speeduino({path: portPath, options: { baudRate: 115200, autoOpen: false }})
    speedy.on('error', () => console.log("Serial port error"))
    speedy.on('unexpected', (data) => { console.log("Unexpected data:", data); throw "ERROR" })

    // Make sure we can connect
    try {
        await new Promise<void>((resolve, reject) => speedy.open((err) => err ? reject(err) : resolve()))
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
    }

    while (true) {
        const everyOneSecond = new Promise<void>(resolve => setTimeout(resolve, interval))
        try {
            const response = await speedy.raw.outputChannels(121)
            console.log((new Date).toISOString(), "Loops per second:", (response[26] << 8) + response[25])
        } catch (err) {
            console.log("Error on outputChannels:", err.message)
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
    const portPath = ports[parseInt(choice['id'] as string)].path

    const continuallLogCPS = async (interval: number) => {
        while (true) {
            await logLPS(portPath, interval)
            await new Promise<void>(resolve => setTimeout(resolve, interval))
        }
    }
    continuallLogCPS(1000)
})