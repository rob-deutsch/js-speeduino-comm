import SerialPort from 'serialport'
import prompt from 'prompt';
import { EventEmitter, Transform, TransformCallback, Writable } from 'stream'
import { createBrotliCompress } from 'zlib';
import { Console } from 'console';
import { Duplex } from 'node:stream';

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
            this.pReject(this.buffer)
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
        this.intervalID = setTimeout(this.emitPacket.bind(this), this.interval)
        return [false, cursor]
    }
    emitPacket() {
        this.pResolve!(this.buffer.slice(0, this.position))
        this.pResolve = undefined
        this.pReject = undefined
    }
    stop() {
        if (this.pReject) {
            this.pReject(this.buffer)
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
    lastPromise?: Promise<Buffer>
    pauseBetweenCommands: number

    constructor(conn: Duplex, pauseBetweenCommands: number = 10) {
        super()
        this.pauseBetweenCommands = pauseBetweenCommands
        this.conn = conn
        // this.sp.pipe(new HexTransformer).pipe(process.stdout)
        this.parser = this.conn.pipe(new ArbPacketParser)
        this.parser.on('unexpected', (data) => this.emit('unexpected', data))
    }

    async sendCommand(cmd: Buffer, rp: PacketSpecPromise): Promise<Buffer> {
        let lastPromise: Promise<any> | undefined = this.lastPromise
        this.lastPromise = rp.getValue()
        if (!lastPromise) {
            lastPromise = new Promise<void>((resolve) => resolve())
        } else {
            lastPromise = lastPromise.then(() => {
                return new Promise((resolve) => setInterval(resolve, this.pauseBetweenCommands))
            })
        }
        lastPromise.finally(() => {
            this.parser.newPacketSpec(rp)
            this.conn.write(cmd)
        })
        return rp.getValue()
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
    const speedy = new HalfDuplexPackets(sp)
    speedy.on('unexpected', (data) => {console.log("Unexpected data:", data); throw "ERROR"})

    // speedy.pipe(new HexTransformer()).pipe(process.stdout)
    sp.open((err) => {
        if (err) throw err
        // speedy.write('S')
        speedy.sendCommand(Buffer.from('Q'), new TResponse(300)).then((response) => {
            console.log(response.toString('ascii'))
        })
        let count: number = 0;
        let lastTime: number;
        console.log("Sending request")
        let getStatus = () => speedy.sendCommand(Buffer.from([0x72, 0x00, 0x30, 0x00, 0x00, 0x79, 0x00]), new SResponse(121)).then((response) => {
            let thisTime = Date.now();
            console.log(thisTime-lastTime, "got response length:", response.length, (response[26]<<8) + response[25])
            lastTime = thisTime;
            count++
            // getStatus()
        })
        // getStatus()
        setInterval(getStatus, 1000)

        // speedy.sendCommand(Buffer.from('L'), new TResponse(100)).then((response) => {
        //     console.log(response.toString('ascii'))
        // })
        // speedy.write(Buffer.from([0x72, 0x00, 0x30, 0x00, 0x00, 0x72, 0x00]))
    })
})