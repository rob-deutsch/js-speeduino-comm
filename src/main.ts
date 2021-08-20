import SerialPort from 'serialport'
import prompt from 'prompt';
import { EventEmitter, Transform, TransformCallback, Writable } from 'stream'
import { Duplex } from 'stream';

class HexTransformer extends Transform {
    _transform(chunk: any, encoding: BufferEncoding, cb: TransformCallback): void {
        let cursor = 0
        while (cursor < chunk.length) {
            this.push("0x" + chunk[cursor].toString(16) + " ")
            cursor++
        }
        cb();
    }
    _flush(cb: TransformCallback) {
        cb()
    }
}

class ArbPacketParser extends Writable {
    ps?: PacketSpec
    constructor() {
        super()
    }
    newPacketSpec(ps: PacketSpec) {
        if (this.ps) {
            const finished = this.ps.write(Buffer.alloc(0))[0]
            if (!finished) {
                throw "Previous parser not finished"
            }
        }
        this.ps = ps
    }
    _write(chunk: any, encoding: BufferEncoding, cb: (error?: Error | null) => void): void {
        let remaining = Buffer.from(chunk)
        while ((remaining.length > 0) && this.ps) {
            let [finished, used] = this.ps.write(remaining)
            if (finished) {
                this.ps = undefined
            }
            remaining = remaining.slice(used)
        }
        if (remaining.length > 0) {
            this.emit('unexpected', remaining)
        }
        cb()
    }
}
interface PacketSpec {
    write(chunk: Buffer): [boolean, number]
    stop(): void
}

interface PacketSpecPromise extends PacketSpec {
    getValue(): Promise<Buffer>
}

class SResponse implements PacketSpecPromise {
    position: number
    buffer: Buffer
    p: Promise<Buffer>
    pResolve?: (value: Buffer | PromiseLike<Buffer>) => void
    pReject?: (reason?: any) => void
    constructor(length: number) {
        this.position = 0
        this.buffer = Buffer.alloc(length)
        this.p = new Promise((resolve, reject) => {
            this.pResolve = resolve
            this.pReject = reject
        })
    }
    write(chunk: Buffer): [boolean, number] {
        if (!this.pResolve) return [true, 0]
        let cursor = 0
        while (cursor < chunk.length) {
            this.buffer[this.position] = chunk[cursor]
            cursor++
            this.position++
            if (this.position === this.buffer.length) {
                if (this.pResolve) {
                    this.pResolve(this.buffer)
                    this.pResolve = undefined
                    this.pReject = undefined
                }
                return [true, cursor]
            }
        }
        return [false, cursor]
    }
    stop() {
        if (this.pReject) {
            this.pReject(new Error('stop() called'))
            this.pResolve = undefined
            this.pReject = undefined
        }
    }
    getValue(): Promise<Buffer> {
        return this.p
    }
}

class TResponse implements PacketSpecPromise {
    interval: number
    intervalID?: NodeJS.Timeout
    position: number
    buffer: Buffer
    p: Promise<Buffer>
    pResolve?: (value: Buffer | PromiseLike<Buffer>) => void
    pReject?: (reason?: any) => void
    constructor(interval: number, maxBufferSize: number = 65536) {
        this.position = 0
        this.buffer = Buffer.alloc(maxBufferSize)
        this.interval = interval
        this.p = new Promise((resolve, reject) => {
            this.pResolve = resolve
            this.pReject = reject
        })
    }
    write(chunk: Buffer): [boolean, number] {
        if (!this.pResolve) return [true, 0]
        if (this.intervalID) clearTimeout(this.intervalID)
        let cursor = 0
        while (cursor < chunk.length) {
            this.buffer[this.position] = chunk[cursor]
            cursor++
            this.position++
            if (this.position === this.buffer.length) {
                this.emitPacket()
                return [true, cursor]
            }
        }
        this.intervalID = setTimeout(() => this.emitPacket(), this.interval)
        return [false, cursor]
    }
    emitPacket() {
        this.pResolve!(this.buffer.slice(0, this.position))
        this.pResolve = undefined
        this.pReject = undefined
    }
    stop() {
        if (this.pReject) {
            this.pReject(new Error('stop() called'))
            this.pResolve = undefined
            this.pReject = undefined
        }
    }
    getValue(): Promise<Buffer> {
        return this.p
    }
}

class HalfDuplexPackets extends EventEmitter {
    conn: Duplex
    parser: ArbPacketParser
    lastPromise: Promise<any>
    pauseBetweenCommands: number

    constructor(conn: Duplex, pauseBetweenCommands: number = 10) {
        super()
        this.pauseBetweenCommands = pauseBetweenCommands
        this.conn = conn
        // this.sp.pipe(new HexTransformer).pipe(process.stdout)
        this.parser = this.conn.pipe(new ArbPacketParser)
        this.parser.on('unexpected', (data) => this.emit('unexpected', data))
        this.lastPromise = new Promise<void>(resolve => resolve())
    }

    async sendCommand(cmd: Buffer, rp: PacketSpecPromise): Promise<Buffer> {
        // When the previous promise completes then send the next command
        this.lastPromise.finally(() => {
            this.parser.newPacketSpec(rp)
            this.conn.write(cmd)
            setTimeout(() => rp.stop(), 1000)
        })
        // Define the ending condition of the last command
        let promiseToWait = () => { return new Promise(resolve => setTimeout(resolve, this.pauseBetweenCommands)) }
        this.lastPromise = rp.getValue().catch(() => {}).finally(() => promiseToWait())
        
        return rp.getValue()
    }
}

class Speeduino {
    conn: HalfDuplexPackets

    constructor(conn: HalfDuplexPackets) {
        this.conn = conn
    }

    async signature(): Promise<string> {
        return this.conn.sendCommand(Buffer.from('Q'), new TResponse(300))
                .then(r => r.toString('ascii'))
    }

    async versionInfo(): Promise<string> {
        return this.conn.sendCommand(Buffer.from('S'), new TResponse(300))
                .then(r => r.toString('ascii'))
    }

    async outputChannels(length: number, canId: number = 0, cmd: number = 0x30, offset: number = 0): Promise<Buffer> {
        let req = new ArrayBuffer(7)
        let reqView = new DataView(req)
        reqView.setUint8(0, 0x72)
        reqView.setUint8(1, canId)
        reqView.setUint8(2, cmd)
        reqView.setUint16(3, offset, true)
        reqView.setUint16(5, length, true)
        let buf = Buffer.from(req)
        return this.conn.sendCommand(buf, new SResponse(length))
    }

}


console.log("Initial run");
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
            console.log("Version:", response)
        })
        speedy.versionInfo().then((response) => {
            console.log("Version:", response)
        })

        let lastTime: number;
        let getStatus = () => {
            speedy.outputChannels(121).then((response) => {
                let thisTime = Date.now();
                console.log(thisTime-lastTime, "got response length:", response.length, (response[26]<<8) + response[25])
                lastTime = thisTime;
            }).catch((error) => {
                console.log("Error on getStatus:", error.message)
            })
        }
        setInterval(getStatus, 1000)
    })
})