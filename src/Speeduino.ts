import { HalfDuplexPackets, PacketSpecPromise } from './HalfDuplexPackets'

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
    timeout() {
        if (this.pReject) {
            this.pReject(new Error('Timeout'))
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
    timeout() {
        if (this.pReject) {
            this.pReject(new Error('Timeout'))
            this.pResolve = undefined
            this.pReject = undefined
        }
    }
    getValue(): Promise<Buffer> {
        return this.p
    }
}


class SpeeduinoRaw {
    conn: HalfDuplexPackets

    constructor(conn: HalfDuplexPackets) {
        this.conn = conn
    }

    async signature(): Promise<Buffer> {
        return this.conn.sendCommand(Buffer.from('Q'), new TResponse(300))
    }

    async versionInfo(): Promise<Buffer> {
        return this.conn.sendCommand(Buffer.from('S'), new TResponse(300))
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

export class Speeduino {
    raw: SpeeduinoRaw

    constructor(conn: HalfDuplexPackets) {
        this.raw = new SpeeduinoRaw(conn)
    }

    async signature(): Promise<string> {
        return this.raw.signature().then(r => r.toString('ascii'))
    }

    async versionInfo(): Promise<string> {
        return this.raw.versionInfo().then(r => r.toString('ascii'))
    }
}