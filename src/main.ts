import SerialPort from 'serialport'
import prompt from 'prompt';
import { HalfDuplexPackets } from './HalfDuplexPackets'
import { Speeduino } from './Speeduino'

SerialPort.list().then(async (ports) => {
    for (let idx in ports) {
        const port = ports[idx]
        console.log(`[${idx}]: ${port.path}`)
    }
    const choice = await prompt.get(['id'])
    const port = ports[parseInt(choice['id'] as string)]

    const sp = new SerialPort(port.path, { baudRate: 115200, autoOpen: false })
    const conn = new HalfDuplexPackets(sp)
    conn.on('unexpected', (data) => {console.log("Unexpected data:", data); throw "ERROR"})
    const speedy = new Speeduino(conn)

    // speedy.pipe(new HexTransformer()).pipe(process.stdout)
    sp.open((err) => {
        if (err) throw err
        speedy.signature().then((response) => {
            console.log("Signature:", response)
        })
        speedy.versionInfo().then((response) => {
            console.log("Version info:", response)
        })

        let logCPS = () => {
            speedy.raw.outputChannels(121).then((response) => {
                console.log((new Date).toISOString(), "Cycles per second:", (response[26]<<8) + response[25])
            }).catch((error) => {
                console.log("Error on outputChannels:", error.message)
            })
        }
        setInterval(logCPS, 1000)
    })
})